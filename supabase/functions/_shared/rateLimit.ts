/**
 * Rate Limiter for Supabase Edge Functions
 * Uses in-memory storage with sliding window algorithm
 * 
 * Note: In production with multiple edge function instances,
 * consider using Redis or Supabase database for distributed rate limiting
 */

interface RateLimitConfig {
    maxRequests: number;     // Maximum requests allowed
    windowMs: number;        // Time window in milliseconds
    keyPrefix?: string;      // Optional prefix for rate limit keys
}

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

// In-memory store for rate limits (resets on cold start)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
const CLEANUP_INTERVAL = 60000; // 1 minute
let lastCleanup = Date.now();

function cleanupExpiredEntries(): void {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;

    lastCleanup = now;
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetAt <= now) {
            rateLimitStore.delete(key);
        }
    }
}

/**
 * Check if a request should be rate limited
 * @returns Object with allowed status and retry-after header value
 */
export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number; retryAfter?: number } {
    cleanupExpiredEntries();

    const key = config.keyPrefix ? `${config.keyPrefix}:${identifier}` : identifier;
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // If no entry exists or window has expired, create new entry
    if (!entry || entry.resetAt <= now) {
        entry = {
            count: 1,
            resetAt: now + config.windowMs
        };
        rateLimitStore.set(key, entry);

        return {
            allowed: true,
            remaining: config.maxRequests - 1,
            resetAt: entry.resetAt
        };
    }

    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return {
            allowed: false,
            remaining: 0,
            resetAt: entry.resetAt,
            retryAfter
        };
    }

    // Increment counter
    entry.count++;

    return {
        allowed: true,
        remaining: config.maxRequests - entry.count,
        resetAt: entry.resetAt
    };
}

/**
 * Extract identifier from request for rate limiting
 * Tries multiple headers and falls back to a generic key
 */
export function getRateLimitIdentifier(req: Request): string {
    // Try to get real IP from various headers
    const forwardedFor = req.headers.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }

    const realIp = req.headers.get('x-real-ip');
    if (realIp) {
        return realIp;
    }

    const cfConnectingIp = req.headers.get('cf-connecting-ip');
    if (cfConnectingIp) {
        return cfConnectingIp;
    }

    // Fallback to a session-based identifier if available
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
        // Use a hash of the auth token as identifier
        return `auth:${simpleHash(authHeader)}`;
    }

    // Final fallback - this is less ideal for rate limiting
    return 'anonymous';
}

/**
 * Simple hash function for creating identifiers
 */
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

/**
 * Create rate limit response headers
 */
export function getRateLimitHeaders(
    remaining: number,
    resetAt: number,
    limit: number
): Record<string, string> {
    return {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': Math.max(0, remaining).toString(),
        'X-RateLimit-Reset': Math.ceil(resetAt / 1000).toString(),
    };
}

/**
 * Create a 429 Too Many Requests response
 */
export function createRateLimitResponse(
    retryAfter: number,
    headers: Record<string, string>
): Response {
    return new Response(
        JSON.stringify({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter
        }),
        {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': retryAfter.toString(),
                ...headers
            }
        }
    );
}

// Preset configurations for common use cases
export const RATE_LIMIT_PRESETS = {
    // Standard API endpoints
    standard: {
        maxRequests: 100,
        windowMs: 60000, // 1 minute
    },
    // Webhook endpoints (higher limit)
    webhook: {
        maxRequests: 500,
        windowMs: 60000, // 1 minute
    },
    // Strict limit for sensitive operations
    strict: {
        maxRequests: 10,
        windowMs: 60000, // 1 minute
    },
    // Very permissive for health checks
    healthCheck: {
        maxRequests: 1000,
        windowMs: 60000, // 1 minute
    }
} as const;
