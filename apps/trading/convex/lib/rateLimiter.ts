import { components } from '#convex/_generated/api';
import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';

// Massive "Stocks Basic" free plan: 5 API calls / minute.
// `capacity: 5` matches the per-minute budget.
// `maxReserved: 5` caps how far any single `reserve: true` call can overdraw
// the bucket, i.e. a caller may never reserve more than 5 tokens in one go.
// Callers that need >5 upstream calls split themselves across multiple cached
// actions, each reserving \u22645 tokens.
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  massiveApi: {
    kind: 'fixed window',
    rate: 5,
    capacity: 5,
    maxReserved: 5,
    period: MINUTE,
  },
});

