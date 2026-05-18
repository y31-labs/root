import { api } from '#convex/_generated/api';
import type { Id } from '#convex/_generated/dataModel';
import { convexQuery } from '@convex-dev/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@workspace/ui/components/ui/button';
import { useAction, useMutation } from 'convex/react';
import { useState } from 'react';

export const Route = createFileRoute('/tickets/$ticketId')({
  component: TicketDetailPage,
});

function RunEventsPanel({ runId }: { runId: Id<'runs'> }) {
  const { data: runEvents = [] } = useQuery(convexQuery(api.runs.listEvents, { runId }));

  return (
    <section className="bg-card text-card-foreground flex flex-col gap-2 rounded-lg border border-border p-4 shadow-sm">
      <h2 className="text-lg font-medium">Run events</h2>
      <p className="text-muted-foreground text-sm">Trace for selected run.</p>
      <ul className="flex flex-col gap-1 text-xs">
        {runEvents.length === 0 ? (
          <li className="text-muted-foreground">No events.</li>
        ) : (
          runEvents.map((e) => (
            <li key={e._id}>
              <span className="text-muted-foreground">{e.type}</span>
              {e.payload ? `: ${e.payload}` : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function TicketDetailPage() {
  const { ticketId } = Route.useParams();
  const id = ticketId as Id<'tickets'>;
  const queryClient = useQueryClient();

  const { data: ticket } = useQuery(convexQuery(api.tickets.get, { ticketId: id }));
  const { data: messages = [] } = useQuery(
    convexQuery(api.messages.listForTicket, { ticketId: id }),
  );
  const { data: runs = [] } = useQuery(convexQuery(api.runs.listByTicket, { ticketId: id }));

  const updateTicket = useMutation(api.tickets.update);
  const appendMessage = useMutation(api.messages.appendUser);
  const enqueueRun = useMutation(api.runs.enqueue);
  const requestCancel = useMutation(api.runs.requestCancel);
  const executeStub = useAction(api.stubActions.executeStub);

  const [message, setMessage] = useState('');
  const [selectedRunId, setSelectedRunId] = useState<Id<'runs'> | null>(null);

  if (!ticket) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Ticket not found.</p>
        <Link to="/">Home</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div>
        <Link
          to="/tickets"
          search={{ repoId: ticket.repoId }}
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Back to tickets
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{ticket.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{ticket.body}</p>
      </div>

      <section className="bg-card text-card-foreground flex flex-col gap-3 rounded-lg border border-border p-4 shadow-sm">
        <h2 className="text-lg font-medium">Status</h2>
        <select
          aria-label="Ticket status"
          className="border-input bg-background w-48 rounded-md border px-3 py-2 text-sm"
          value={ticket.status}
          onChange={async (e) => {
            const status = e.target.value as 'open' | 'in_progress' | 'done';
            await updateTicket({ ticketId: id, status });
            await queryClient.invalidateQueries(convexQuery(api.tickets.get, { ticketId: id }));
          }}
        >
          <option value="open">open</option>
          <option value="in_progress">in_progress</option>
          <option value="done">done</option>
        </select>
      </section>

      <section className="bg-card text-card-foreground flex flex-col gap-3 rounded-lg border border-border p-4 shadow-sm">
        <h2 className="text-lg font-medium">Thread</h2>
        <p className="text-muted-foreground text-sm">User messages on this ticket.</p>
        <ul className="border-border flex max-h-64 flex-col gap-2 overflow-y-auto rounded-md border p-3">
          {messages.length === 0 ? (
            <li className="text-muted-foreground text-sm">No messages yet.</li>
          ) : (
            messages.map((m) => (
              <li key={m._id} className="text-sm">
                <span className="text-muted-foreground">{m.role}: </span>
                {m.content}
              </li>
            ))
          )}
        </ul>
        <div className="flex gap-2">
          <input
            className="border-input bg-background flex-1 rounded-md border px-3 py-2 text-sm"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add context for the next run…"
          />
          <Button
            type="button"
            disabled={!message.trim()}
            onClick={async () => {
              await appendMessage({ ticketId: id, content: message.trim() });
              await queryClient.invalidateQueries(
                convexQuery(api.messages.listForTicket, { ticketId: id }),
              );
              setMessage('');
            }}
          >
            Send
          </Button>
        </div>
      </section>

      <section className="bg-card text-card-foreground flex flex-col gap-3 rounded-lg border border-border p-4 shadow-sm">
        <h2 className="text-lg font-medium">Runs</h2>
        <p className="text-muted-foreground text-sm">
          Enqueue a stub run (no GitHub yet). Select a run to view events.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={async () => {
              const runId = await enqueueRun({ ticketId: id });
              await queryClient.invalidateQueries(
                convexQuery(api.runs.listByTicket, { ticketId: id }),
              );
              await executeStub({ runId });
              await queryClient.invalidateQueries(
                convexQuery(api.runs.listByTicket, { ticketId: id }),
              );
            }}
          >
            Enqueue and run stub
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {runs.map((r) => (
            <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button
                type="button"
                className={
                  selectedRunId === r._id
                    ? 'text-primary font-medium underline'
                    : 'text-foreground hover:underline'
                }
                onClick={() => setSelectedRunId(r._id)}
              >
                {r._id.slice(-6)} — {r.status}
              </button>
              {(r.status === 'queued' || r.status === 'running') && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await requestCancel({ runId: r._id });
                    await executeStub({ runId: r._id });
                    await queryClient.invalidateQueries(
                      convexQuery(api.runs.listByTicket, { ticketId: id }),
                    );
                  }}
                >
                  Cancel
                </Button>
              )}
              {r.error ? <span className="text-danger text-xs">{r.error}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      {selectedRunId ? <RunEventsPanel runId={selectedRunId} /> : null}
    </div>
  );
}
