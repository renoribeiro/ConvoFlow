/**
 * React Query configuration for optimal caching and performance
 */

import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { logger } from '@/lib/logger';

// Query key prefixes for different data types
export const QUERY_KEYS = {
    // Real-time data - should be fresh frequently
    MESSAGES: 'messages',
    CONVERSATIONS: 'conversations',
    NOTIFICATIONS: 'notifications',
    INSTANCE_STATUS: 'instance-status',

    // Semi-static data - can be cached longer
    CONTACTS: 'contacts',
    CHATBOTS: 'chatbots',
    CAMPAIGNS: 'campaigns',
    TEMPLATES: 'templates',
    AUTOMATIONS: 'automations',

    // Static data - rarely changes
    TENANT: 'tenant',
    PROFILE: 'profile',
    SETTINGS: 'settings',
    MODULES: 'modules',
} as const;

// Cache times in milliseconds
const CACHE_TIMES = {
    // Real-time data: 30 seconds stale, 2 minutes garbage collection
    realtime: {
        staleTime: 30 * 1000,
        gcTime: 2 * 60 * 1000,
    },
    // Semi-static data: 5 minutes stale, 15 minutes gc
    semiStatic: {
        staleTime: 5 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
    },
    // Static data: 30 minutes stale, 1 hour gc
    static: {
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
    },
} as const;

// Real-time query keys that need frequent updates
const REALTIME_KEYS = [
    QUERY_KEYS.MESSAGES,
    QUERY_KEYS.CONVERSATIONS,
    QUERY_KEYS.NOTIFICATIONS,
    QUERY_KEYS.INSTANCE_STATUS,
];

// Static query keys that rarely change
const STATIC_KEYS = [
    QUERY_KEYS.TENANT,
    QUERY_KEYS.PROFILE,
    QUERY_KEYS.SETTINGS,
    QUERY_KEYS.MODULES,
];

/**
 * Determine cache configuration based on query key
 */
function getCacheConfig(queryKey: unknown): typeof CACHE_TIMES.realtime {
    if (!Array.isArray(queryKey) || queryKey.length === 0) {
        return CACHE_TIMES.semiStatic;
    }

    const primaryKey = String(queryKey[0]);

    if (REALTIME_KEYS.some(key => primaryKey.includes(key))) {
        return CACHE_TIMES.realtime;
    }

    if (STATIC_KEYS.some(key => primaryKey.includes(key))) {
        return CACHE_TIMES.static;
    }

    return CACHE_TIMES.semiStatic;
}

/**
 * Custom retry logic based on error type
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
    // Max 3 retries
    if (failureCount >= 3) return false;

    // Check if error is an HTTP error
    if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status: number }).status;

        // Don't retry client errors (4xx) except 408 (timeout) and 429 (rate limit)
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            return false;
        }

        // Retry rate limit errors with longer delay
        if (status === 429) {
            return failureCount < 2;
        }
    }

    // Don't retry network errors more than twice
    if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network'))) {
        return failureCount < 2;
    }

    return true;
}

/**
 * Create and configure the Query Client with optimized settings
 */
export function createQueryClient(): QueryClient {
    // Query cache with global error handling
    const queryCache = new QueryCache({
        onError: (error, query) => {
            // Only log errors for queries that have already been cached
            // (avoid logging errors during initial load)
            if (query.state.data !== undefined) {
                logger.error('Query error', {
                    queryKey: query.queryKey,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        },
    });

    // Mutation cache with global error handling
    const mutationCache = new MutationCache({
        onError: (error, _variables, _context, mutation) => {
            logger.error('Mutation error', {
                mutationKey: mutation.options.mutationKey,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        },
        onSuccess: (_data, _variables, _context, mutation) => {
            // Invalidate related queries on successful mutations
            const mutationKey = mutation.options.mutationKey;
            if (mutationKey && Array.isArray(mutationKey)) {
                const primaryKey = String(mutationKey[0]);

                // Auto-invalidate list queries when item is mutated
                if (primaryKey.endsWith('-item')) {
                    const listKey = primaryKey.replace('-item', '');
                    queryClient.invalidateQueries({ queryKey: [listKey] });
                }
            }
        },
    });

    const queryClient = new QueryClient({
        queryCache,
        mutationCache,
        defaultOptions: {
            queries: {
                // Use dynamic stale time based on query key
                staleTime: CACHE_TIMES.semiStatic.staleTime,
                gcTime: CACHE_TIMES.semiStatic.gcTime,

                // Custom retry logic
                retry: shouldRetry,
                retryDelay: (attemptIndex) => {
                    // Exponential backoff: 1s, 2s, 4s
                    return Math.min(1000 * 2 ** attemptIndex, 8000);
                },

                // Refetch behavior
                refetchOnWindowFocus: true,
                refetchOnReconnect: true,
                refetchOnMount: true,

                // Network mode
                networkMode: 'offlineFirst',

                // Structural sharing for performance
                structuralSharing: true,
            },
            mutations: {
                retry: 1,
                retryDelay: 1000,
                networkMode: 'offlineFirst',
            },
        },
    });

    return queryClient;
}

/**
 * Hook to get optimized query options based on query type
 */
export function getQueryOptions(queryKey: unknown[]) {
    const cacheConfig = getCacheConfig(queryKey);

    return {
        staleTime: cacheConfig.staleTime,
        gcTime: cacheConfig.gcTime,
    };
}

/**
 * Prefetch commonly used queries for better UX
 */
export async function prefetchCommonQueries(queryClient: QueryClient, tenantId: string) {
    // These will be prefetched in the background
    const prefetchPromises = [
        queryClient.prefetchQuery({
            queryKey: [QUERY_KEYS.TENANT, tenantId],
            staleTime: CACHE_TIMES.static.staleTime,
        }),
        queryClient.prefetchQuery({
            queryKey: [QUERY_KEYS.SETTINGS, tenantId],
            staleTime: CACHE_TIMES.static.staleTime,
        }),
    ];

    await Promise.allSettled(prefetchPromises);
}

// Export cache times for use in individual queries
export { CACHE_TIMES };
