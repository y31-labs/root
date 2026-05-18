import { api } from '#convex/_generated/api';
import type { Id } from '#convex/_generated/dataModel';
import { convexQuery } from '@convex-dev/react-query';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@workspace/ui/components/ui/button';
import { useMutation } from 'convex/react';
import { useState } from 'react';

export const Route = createFileRoute('/tickets/')({
  validateSearch: (raw: Record<string, unknown>) => {
    const repoId = raw.repoId;
    if (typeof repoId !== 'string' || repoId.length === 0) {
      throw redirect({ to: '/' });
    }
    return { repoId: repoId as Id<'repos'> };
  },
  component: TicketsPage,
});

function TicketsPage() {
  const { repoId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: tickets = [] } = useQuery(convexQuery(api.tickets.listForRepo, { repoId }));
  const createTicket = useMutation(api.tickets.create);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div>
        <Link to="/" className="text-muted-foreground text-sm underline-offset-4 hover:underline">
          All repos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Tickets</h1>
      </div>

      <section className="bg-card text-card-foreground flex flex-col gap-4 rounded-lg border border-border p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-medium">New ticket</h2>
          <p className="text-muted-foreground text-sm">Describe the change for the agent.</p>
        </div>
        <div className="flex flex-col gap-3">
          <label className="grid gap-1 text-sm font-medium" htmlFor="title">
            Title
            <input
              id="title"
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Fix login redirect"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="body">
            Description
            <input
              id="body"
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Acceptance criteria, links, etc."
            />
          </label>
          <Button
            type="button"
            disabled={!title.trim()}
            onClick={async () => {
              const ticketId = await createTicket({
                repoId,
                title: title.trim(),
                body: body.trim(),
              });
              await queryClient.invalidateQueries(convexQuery(api.tickets.listForRepo, { repoId }));
              setTitle('');
              setBody('');
              void navigate({
                to: '/tickets/$ticketId',
                params: { ticketId },
              });
            }}
          >
            Create
          </Button>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Open work</h2>
        {tickets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tickets yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tickets.map((t) => (
              <li key={t._id}>
                <Link
                  to="/tickets/$ticketId"
                  params={{ ticketId: t._id }}
                  className="text-primary font-medium underline-offset-4 hover:underline"
                >
                  {t.title}
                </Link>
                <span className="text-muted-foreground ml-2 text-sm">{t.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
