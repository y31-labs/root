import { createFileRoute } from '@tanstack/react-router';
import { getAuth } from '@workos/authkit-tanstack-react-start';

import { getEnv } from '#/lib/utils';

const STATE_COOKIE = 'github_install_state';

export const Route = createFileRoute('/api/github/install')({
  server: {
    handlers: {
      GET: async () => {
        const auth = await getAuth();
        if (!auth.user)
          return new Response(null, {
            status: 307,
            headers: { Location: '/api/auth/sign-in?returnPathname=/' },
          });

        const slug = getEnv('VITE_GITHUB_APP_SLUG');
        if (!slug)
          return new Response('GitHub App slug is not configured', {
            status: 500,
          });

        const state = crypto.randomUUID();
        const location = `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`;

        return new Response(null, {
          status: 307,
          headers: {
            Location: location,
            'Set-Cookie': `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
          },
        });
      },
    },
  },
});
