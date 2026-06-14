import { useParams } from '@tanstack/react-router';
import { listen } from '@tauri-apps/api/event';
import { PageHeader } from '@workspace/code-workbench/page-header';
import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/ui/tabs';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import { Check, FolderOpen, Play, RotateCcw, Square, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ChangeSessionStatusBadge } from '#/components/change-session-status';
import type { SessionDetail } from '#/lib/local-api';
import { useLocalApi } from '#/providers/local-api-provider';

const activeStatuses = ['preparing', 'implementing', 'verifying', 'repairing'];
const recoverableStatuses = ['needs_input', 'failed', 'cancelled'];

export function ChangeSessionPage() {
  const { sessionId } = useParams({ from: '/sessions/$sessionId' });
  const api = useLocalApi();
  const [detail, setDetail] = useState<SessionDetail>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [artifactPreview, setArtifactPreview] = useState<{
    id: string;
    label: string;
    content: string;
  }>();

  const refresh = useCallback(async () => {
    try {
      const next = await api.getChangeSession(sessionId);
      if (next) setDetail(next);
      setError('');
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, [api, sessionId]);

  useEffect(() => {
    void refresh();
    if (!('__TAURI_INTERNALS__' in window)) return;
    const unlisten = listen<{ sessionId?: string }>('change-session-event', (event) => {
      if (!event.payload.sessionId || event.payload.sessionId === sessionId) void refresh();
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [refresh, sessionId]);

  const latestResults = useMemo(() => {
    const results = new Map<string, SessionDetail['gateResults'][number]>();
    for (const result of detail?.gateResults ?? []) results.set(result.kind, result);
    return [...results.values()];
  }, [detail?.gateResults]);

  if (!detail) return <div className='p-6'>{error || 'Loading change session...'}</div>;
  const { session, snapshot } = detail;
  const active = activeStatuses.includes(session.status);
  const recoverable = recoverableStatuses.includes(session.status);
  const canVerify = !active && !['accepted', 'discarded'].includes(session.status);
  const canDiscard = !active && session.status !== 'accepted' && session.status !== 'discarded';
  const canAccept =
    session.status === 'verified' &&
    !detail.verificationStale &&
    snapshot?.hasDiff &&
    snapshot.required > 0 &&
    snapshot.passed === snapshot.required &&
    snapshot.failed === 0 &&
    snapshot.missing === 0;

  const perform = async (action: () => Promise<unknown>) => {
    setPending(true);
    try {
      await action();
      await refresh();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className='min-w-0 space-y-6 p-6'>
      <PageHeader
        title={session.request}
        description={`${session.repositoryName} · ${session.baseSha.slice(0, 12)}`}
        meta={<ChangeSessionStatusBadge status={session.status} />}
        actions={
          <>
            {active ? (
              <Button
                variant='destructive'
                disabled={pending}
                onClick={() => perform(() => api.cancelChangeSession(session.id))}
              >
                <Square data-icon='inline-start' />
                Cancel
              </Button>
            ) : null}
            {canVerify ? (
              <Button
                variant='outline'
                disabled={pending}
                onClick={() => perform(() => api.verifyChangeSession(session.id))}
              >
                <RotateCcw data-icon='inline-start' />
                Verify again
              </Button>
            ) : null}
            {canAccept ? (
              <Button
                disabled={pending}
                onClick={() => perform(() => api.acceptChangeSession(session.id))}
              >
                <Check data-icon='inline-start' />
                Accept branch
              </Button>
            ) : null}
            {canDiscard ? (
              <Button
                variant='destructive'
                disabled={pending}
                onClick={() => {
                  if (window.confirm('Remove this session worktree and its unaccepted changes?')) {
                    void perform(() => api.discardChangeSession(session.id));
                  }
                }}
              >
                <Trash2 data-icon='inline-start' />
                Discard
              </Button>
            ) : null}
          </>
        }
      />

      {detail.verificationStale && session.status === 'verified' ? (
        <p className='border-warning/40 border-y py-3 text-warning text-sm'>
          The worktree changed after verification. Acceptance is blocked until verification runs
          again.
        </p>
      ) : null}
      {session.terminalReason ? (
        <p className='border-y py-3 text-sm'>{session.terminalReason}</p>
      ) : null}
      {error ? <p className='text-destructive text-sm'>{error}</p> : null}

      {recoverable ? (
        <section className='space-y-4'>
          <div>
            <h2 className='font-medium'>Continue session</h2>
            <p className='text-muted-foreground text-sm'>
              Continue in the same worktree and Codex thread, or verify the current tree as-is.
            </p>
          </div>
          <Textarea
            placeholder='Optional guidance for the next implementation turn.'
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <Button
            disabled={pending}
            onClick={() =>
              perform(async () => {
                await api.continueChangeSession(session.id, message);
                setMessage('');
              })
            }
          >
            <Play data-icon='inline-start' />
            Continue
          </Button>
        </section>
      ) : null}

      {detail.approvals.some((approval) => approval.status === 'pending') ? (
        <section className='space-y-4'>
          <div>
            <h2 className='font-medium'>Approvals</h2>
            <p className='text-muted-foreground text-sm'>
              External paths, network, secrets, and privileged operations require your decision.
            </p>
          </div>
          <div className='divide-y border-y'>
            {detail.approvals
              .filter((approval) => approval.status === 'pending')
              .map((approval) => (
                <div key={JSON.stringify(approval.requestId)} className='py-4'>
                  <p className='text-sm'>{approval.detail}</p>
                  <p className='text-muted-foreground mt-1 text-xs'>{approval.method}</p>
                  <div className='mt-3 flex gap-2'>
                    <Button
                      size='sm'
                      onClick={() =>
                        perform(() =>
                          api.resolveSessionApproval(approval.requestId, approval.method, 'accept'),
                        )
                      }
                    >
                      <Check data-icon='inline-start' />
                      Allow once
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() =>
                        perform(() =>
                          api.resolveSessionApproval(
                            approval.requestId,
                            approval.method,
                            'acceptForSession',
                          ),
                        )
                      }
                    >
                      Allow for session
                    </Button>
                    <Button
                      size='sm'
                      variant='destructive'
                      onClick={() =>
                        perform(() =>
                          api.resolveSessionApproval(
                            approval.requestId,
                            approval.method,
                            'decline',
                          ),
                        )
                      }
                    >
                      <X data-icon='inline-start' />
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      <Tabs defaultValue='activity'>
        <TabsList>
          <TabsTrigger value='activity'>Conversation and activity</TabsTrigger>
          <TabsTrigger value='verification'>Verification</TabsTrigger>
          <TabsTrigger value='diff'>Diff</TabsTrigger>
          <TabsTrigger value='artifacts'>Artifacts</TabsTrigger>
        </TabsList>
        <TabsContent value='activity'>
          <div className='divide-y border-y'>
            {detail.events.map((event) => (
              <div key={event.id} className='py-4'>
                <div className='flex items-start justify-between gap-3'>
                  <p className='whitespace-pre-wrap text-sm'>{event.message}</p>
                  <Badge variant='outline'>{event.kind}</Badge>
                </div>
              </div>
            ))}
            {detail.events.length === 0 ? (
              <p className='text-muted-foreground py-5 text-sm'>No activity yet.</p>
            ) : null}
          </div>
        </TabsContent>
        <TabsContent value='verification'>
          <section className='space-y-4'>
            <div>
              <h2 className='font-medium'>Verification snapshot</h2>
              <p className='text-muted-foreground text-sm'>
                {snapshot
                  ? `${snapshot.passed}/${snapshot.required} required checks passed for ${snapshot.worktreeDigest.slice(0, 12)}`
                  : 'Verification has not completed.'}
              </p>
            </div>
            <div className='divide-y border-y'>
              {latestResults.map((result) => (
                <div key={result.kind} className='flex items-center justify-between gap-3 py-3'>
                  <span>
                    <strong>{result.kind}</strong>
                    <span className='text-muted-foreground ml-2 text-xs'>
                      attempt {result.attempt} · {(result.durationMs / 1000).toFixed(1)}s
                    </span>
                  </span>
                  <Badge variant={result.status === 'passed' ? 'default' : 'destructive'}>
                    {result.status}
                  </Badge>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>
        <TabsContent value='diff'>
          <div className='border-y py-5'>
            <pre className='bg-muted max-h-[50rem] overflow-auto rounded-lg p-4 text-xs'>
              {detail.diff || 'No repository changes.'}
            </pre>
          </div>
        </TabsContent>
        <TabsContent value='artifacts'>
          <div className='divide-y border-y'>
            {detail.artifacts.map((artifact) => (
              <div
                key={artifact.id}
                className='flex items-center justify-between gap-3 py-3'
              >
                <span className='min-w-0'>
                  <span className='block truncate text-sm font-medium'>{artifact.label}</span>
                  <span className='text-muted-foreground text-xs'>{artifact.kind}</span>
                </span>
                <span className='flex shrink-0 gap-2'>
                  {artifact.kind !== 'playwrightTrace' ? (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() =>
                        perform(async () => {
                          const content = await api.readArtifact(artifact.path);
                          setArtifactPreview({
                            id: artifact.id,
                            label: artifact.label,
                            content,
                          });
                        })
                      }
                    >
                      Preview
                    </Button>
                  ) : null}
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => api.revealArtifact(artifact.path)}
                  >
                    <FolderOpen data-icon='inline-start' />
                    Reveal
                  </Button>
                </span>
              </div>
            ))}
            {detail.artifacts.length === 0 ? (
              <p className='text-muted-foreground py-5 text-sm'>No artifacts yet.</p>
            ) : null}
          </div>
          {artifactPreview ? (
            <section className='mt-5 space-y-3 border-y py-4'>
              <div className='flex items-center justify-between gap-3'>
                <h2 className='font-medium'>{artifactPreview.label}</h2>
                <Button variant='ghost' size='sm' onClick={() => setArtifactPreview(undefined)}>
                  Close
                </Button>
              </div>
              {artifactPreview.content.startsWith('data:image/') ? (
                <img
                  className='max-h-[42rem] max-w-full object-contain'
                  src={artifactPreview.content}
                  alt={artifactPreview.label}
                />
              ) : (
                <pre className='bg-muted max-h-[42rem] overflow-auto rounded-lg p-4 text-xs'>
                  {artifactPreview.content}
                </pre>
              )}
            </section>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
