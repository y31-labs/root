import { createFileRoute } from '@tanstack/react-router';
import { ZodError } from 'zod';

export const Route = createFileRoute('/api/plugins')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ pluginCallSchema }, { executePluginCall }] = await Promise.all([
          import('#/lib/plugin-contract'),
          import('#/server/plugins/registry'),
        ]);

        try {
          const call = pluginCallSchema.parse((await request.json()) as unknown);
          return Response.json(await executePluginCall(call));
        } catch (error) {
          const message =
            error instanceof ZodError
              ? error.issues.map((issue) => issue.message).join(', ')
              : error instanceof Error
                ? error.message
                : 'Unable to update app data.';

          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
