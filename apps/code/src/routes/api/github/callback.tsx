import { createFileRoute, redirect } from '@tanstack/react-router';
import { getAuth } from '@workos/authkit-tanstack-react-start';
import { ConvexHttpClient } from 'convex/browser';

import { getEnv } from '#/lib/utils';
import { api } from '#convex/_generated/api';

const STATE_COOKIE = 'github_install_state';

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key === name) return decodeURIComponent(valueParts.join('='));
  }

  return null;
}

export const Route = createFileRoute('/api/github/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await getAuth();
        if (!auth.user) throw redirect({ to: '/api/auth/sign-in' });

        const url = new URL(request.url);
        const installationId = Number(url.searchParams.get('installation_id'));
        const state = url.searchParams.get('state');
        const expectedState = readCookie(request, STATE_COOKIE);

        if (!Number.isFinite(installationId))
          return new Response('Missing installation_id', { status: 400 });

        if (!state || !expectedState || state !== expectedState)
          return new Response('Invalid GitHub install state', { status: 400 });

        const client = new ConvexHttpClient(getEnv('VITE_CONVEX_URL'));
        client.setAuth(auth.accessToken);

        try {
          await client.action(api.githubActions.completeInstallationSetup, {
            installationId,
          });
        } catch (error) {
          return new Response(
            `Github setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            { status: 500 },
          );
        }

        return new Response(null, {
          status: 307,
          headers: {
            Location: '/',
            'Set-Cookie': `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
          },
        });
      },
    },
  },
});
