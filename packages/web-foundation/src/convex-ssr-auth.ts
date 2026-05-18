import type { ConvexQueryClient } from '@convex-dev/react-query';

/** During SSR, attach WorkOS JWT so Convex HTTP queries are authenticated. */
export function setConvexQueryClientAuthForSsr(
  convexQueryClient: ConvexQueryClient,
  token: string | null,
) {
  if (token) convexQueryClient.serverHttpClient?.setAuth(token);
}
