import type { ActionCtx } from '#convex/_generated/server';
import { rateLimiter } from '#convex/lib/rateLimiter';
import { DefaultApi, restClient } from '@massive.com/client-js';

// Must stay <= capacity + maxReserved for the `massiveApi` rate limiter.
export const MAX_RESERVABLE_REQUESTS = 5;

// Safety cap: even with contention a single acquisition shouldn't block
// longer than ~10 minutes. Convex actions have their own execution ceiling.
const MAX_ACQUIRE_WAIT_MS = 10 * 60 * 1000;

// Reserves `reserveRequests` tokens from the `massiveApi` bucket in a single
// round-trip. With `reserve: true`, the rate limiter can schedule us ahead of
// currently available capacity; `retryAfter` is the amount of time we must
// wait before the reservation is actually honored.
//
// When other concurrent reservations have pushed the bucket below
// `-maxReserved`, the limiter returns `{ ok: false, retryAfter }` and we loop:
// sleep `retryAfter`, then try again. This is why the rate limiter needs
// `maxReserved >= reserveRequests` - otherwise the validation would throw
// before we ever get to retry.
export const getMassiveClient = async (
  ctx: ActionCtx,
  reserveRequests: number,
): Promise<DefaultApi> => {
  if (reserveRequests > MAX_RESERVABLE_REQUESTS) {
    throw new Error(
      `reserveRequests (${reserveRequests}) exceeds MAX_RESERVABLE_REQUESTS (${MAX_RESERVABLE_REQUESTS}); split the caller across multiple cached actions.`,
    );
  }

  const deadline = Date.now() + MAX_ACQUIRE_WAIT_MS;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { ok, retryAfter } = await rateLimiter.limit(ctx, 'massiveApi', {
      reserve: true,
      count: reserveRequests,
    });

    if (ok) {
      if (retryAfter && retryAfter > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryAfter));
      }
      break;
    }

    // ok:false means the cumulative reservation would exceed maxReserved.
    // Wait out `retryAfter` so other reservations release, then retry.
    if (Date.now() + retryAfter > deadline) {
      throw new Error(
        `Massive rate limit could not acquire ${reserveRequests} tokens within ${MAX_ACQUIRE_WAIT_MS}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, retryAfter));
  }

  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) throw new Error('MASSIVE_API_KEY is missing');

  return restClient(apiKey);
};
