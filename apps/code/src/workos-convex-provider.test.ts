import { describe, expect, it, vi } from 'vitest';

import { splitWorkosAuth } from '../../../packages/web-foundation/src/workos-auth-server-fn';
import { getConvexAuthState } from '../../../packages/web-foundation/src/workos-convex-provider';

describe('WorkOS Convex authentication', () => {
  it('keeps the Convex access token out of client initial auth', () => {
    const result = splitWorkosAuth({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      accessToken: 'secret-token',
    } as never);

    expect(result.token).toBe('secret-token');
    expect(result.initialAuth).toEqual({
      user: { id: 'user_123' },
      sessionId: 'session_123',
    });
    expect(result.initialAuth).not.toHaveProperty('accessToken');
  });

  it.each([
    {
      name: 'loading',
      loading: true,
      user: null,
      isAuthenticated: false,
      isLoading: true,
    },
    {
      name: 'authenticated',
      loading: false,
      user: { id: 'user_123' },
      isAuthenticated: true,
      isLoading: false,
    },
    {
      name: 'unauthenticated',
      loading: false,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    },
  ])('maps the $name WorkOS state for Convex', ({ loading, user, isAuthenticated, isLoading }) => {
    const fetchAccessToken = vi.fn(async () => 'access-token');

    expect(getConvexAuthState(loading, user, fetchAccessToken)).toEqual({
      isAuthenticated,
      isLoading,
      fetchAccessToken,
    });
  });
});
