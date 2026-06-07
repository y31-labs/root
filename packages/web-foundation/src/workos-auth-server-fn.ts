import { createServerFn } from '@tanstack/react-start';
import { getAuth } from '@workos/authkit-tanstack-react-start';
import type { AuthKitProviderProps } from '@workos/authkit-tanstack-react-start/client';

type InitialAuth = NonNullable<AuthKitProviderProps['initialAuth']>;
type ServerAuth =
  | Extract<InitialAuth, { user: null }>
  | (Exclude<InitialAuth, { user: null }> & { accessToken: string });

export function splitWorkosAuth(auth: ServerAuth) {
  if (!auth.user) {
    return {
      initialAuth: auth,
      token: null,
    };
  }

  const { accessToken, ...initialAuth } = auth;
  return {
    initialAuth,
    token: accessToken,
  };
}

/** Server fn: WorkOS session + access token for Convex SSR (`serverHttpClient.setAuth`). */
export const fetchWorkosAuth = createServerFn({ method: 'GET' }).handler(async () => {
  return splitWorkosAuth(await getAuth());
});
