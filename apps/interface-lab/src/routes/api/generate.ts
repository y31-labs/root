import { createFileRoute } from '@tanstack/react-router';
import { ZodError } from 'zod';

export const Route = createFileRoute('/api/generate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { generateInterface } = await import('#/server/interface-generator');

        try {
          const body = (await request.json()) as unknown;
          return Response.json(await generateInterface(body));
        } catch (error) {
          const message =
            error instanceof ZodError
              ? error.issues.map((issue) => issue.message).join(', ')
              : error instanceof Error
                ? error.message
                : 'Unable to generate interface.';

          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
