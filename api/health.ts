/**
 * Health Check API Endpoint
 * 
 * This endpoint is used by load balancers, monitoring tools,
 * and deployment pipelines to verify the application is running.
 * 
 * GET /api/health
 * 
 * Response:
 * - 200 OK: Application is healthy
 * - 503 Service Unavailable: Application has issues
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface HealthCheckResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    version: string;
    environment: string;
    uptime: number;
    checks: {
        name: string;
        status: 'pass' | 'fail';
        message?: string;
        duration?: number;
    }[];
}

// Track startup time for uptime calculation
const startupTime = Date.now();

// Version from package.json (set during build)
const APP_VERSION = process.env.npm_package_version || '1.0.0';
const ENVIRONMENT = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
): Promise<void> {
    // Only allow GET requests
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const checks: HealthCheckResponse['checks'] = [];

    // Check 1: Basic runtime check (always passes if we got here)
    checks.push({
        name: 'runtime',
        status: 'pass',
        message: 'Application is running',
    });

    // Check 2: Environment variables check
    const requiredEnvVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
    const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

    checks.push({
        name: 'environment',
        status: missingEnvVars.length === 0 ? 'pass' : 'fail',
        message: missingEnvVars.length === 0
            ? 'All required environment variables are set'
            : `Missing: ${missingEnvVars.join(', ')}`,
    });

    // Check 3: Supabase connectivity (optional, lightweight check)
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    if (supabaseUrl) {
        const supabaseCheckStart = Date.now();
        try {
            // Just check if we can reach the Supabase health endpoint
            const response = await fetch(`${supabaseUrl}/rest/v1/`, {
                method: 'HEAD',
                headers: {
                    'apikey': process.env.VITE_SUPABASE_ANON_KEY || '',
                },
                signal: AbortSignal.timeout(5000), // 5 second timeout
            });

            checks.push({
                name: 'supabase',
                status: response.ok ? 'pass' : 'fail',
                message: response.ok ? 'Supabase is reachable' : `Supabase returned ${response.status}`,
                duration: Date.now() - supabaseCheckStart,
            });
        } catch (error) {
            checks.push({
                name: 'supabase',
                status: 'fail',
                message: error instanceof Error ? error.message : 'Connection failed',
                duration: Date.now() - supabaseCheckStart,
            });
        }
    }

    // Check 4: Memory usage (for monitoring)
    if (typeof process !== 'undefined' && process.memoryUsage) {
        const memoryUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
        const heapPercentage = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

        checks.push({
            name: 'memory',
            status: heapPercentage < 90 ? 'pass' : 'fail',
            message: `Heap: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapPercentage}%)`,
        });
    }

    // Determine overall status
    const hasFailures = checks.some((check) => check.status === 'fail');
    const status: HealthCheckResponse['status'] = hasFailures ? 'degraded' : 'healthy';

    const response: HealthCheckResponse = {
        status,
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
        environment: ENVIRONMENT,
        uptime: Math.floor((Date.now() - startupTime) / 1000),
        checks,
    };

    // Set appropriate status code
    const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

    // Set cache headers (don't cache health checks)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');

    res.status(statusCode).json(response);
}
