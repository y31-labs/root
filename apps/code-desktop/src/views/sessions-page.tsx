import { useNavigate } from '@tanstack/react-router';
import type { ChangeSession } from '@workspace/code-agent-contracts/sessions';
import { PageHeader } from '@workspace/code-workbench/page-header';
import { useCallback, useEffect, useState } from 'react';

import { ChangeSessionStatusBadge } from '#/components/change-session-status';
import { useLocalApi } from '#/providers/local-api-provider';

type SessionSummary = ChangeSession & { repositoryName: string };

export function SessionsPage() {
  const api = useLocalApi();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setSessions(await api.listChangeSessions());
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className='min-w-0 space-y-6 p-6'>
      <PageHeader
        title='Change sessions'
        description='Recoverable local worktrees, verification results, and accepted branches.'
      />
      {error ? <p className='text-destructive text-sm'>{error}</p> : null}
      <section className='space-y-4'>
        <div>
          <h2 className='font-medium'>Recent sessions</h2>
          <p className='text-muted-foreground text-sm'>
            Interrupted work never resumes without an explicit action.
          </p>
        </div>
        <div className='divide-y border-y'>
          {sessions.map((session) => (
            <button
              key={session.id}
              type='button'
              className='hover:bg-muted flex w-full items-center justify-between gap-3 py-3 text-left'
              onClick={() =>
                navigate({ to: '/sessions/$sessionId', params: { sessionId: session.id } })
              }
            >
              <span className='min-w-0'>
                <span className='block truncate font-medium'>{session.request}</span>
                <span className='text-muted-foreground text-xs'>
                  {session.repositoryName} · {session.baseSha.slice(0, 12)}
                </span>
              </span>
              <ChangeSessionStatusBadge status={session.status} />
            </button>
          ))}
          {sessions.length === 0 ? (
            <p className='text-muted-foreground py-6 text-sm'>No change sessions yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
