import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { TaskForm } from '@workspace/code-workbench/task-form';
import { Button } from '@workspace/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/ui/card';
import { useAction, useMutation } from 'convex/react';
import { Play } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';

import { desktopQueries } from '#/lib/queries';
import { localApi } from '#/lib/local-api';
import { api } from '#convex/_generated/api';

export function TasksPage() {
  const { data: repos = [] } = useQuery(desktopQueries.repos);
  const { data: tickets = [] } = useQuery(desktopQueries.tickets);
  const createTicket = useMutation(api.tickets.create);
  const heartbeat = useMutation(api.desktops.heartbeat);
  const startRun = useMutation(api.runs.start);
  const getCloneSource = useAction(api.githubActions.getCloneSource);
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPending, startTransition] = useTransition();
  const selectedRepo = repos.find((repo) => repo.selected);

  useEffect(() => {
    void localApi.installationId().then((installationId) =>
      heartbeat({
        installationId,
        name: 'This Mac',
        appVersion: '0.1.0',
      }),
    );
  }, [heartbeat]);

  const createTask = () => {
    if (!selectedRepo) return;
    startTransition(async () => {
      await createTicket({ repoId: selectedRepo._id, title, body });
      setTitle('');
      setBody('');
    });
  };

  const runTask = (ticket: (typeof tickets)[number]) => {
    const repo = repos.find((item) => item._id === ticket.repoId);
    if (!repo?.manifest || !repo.manifestBaseSha) return;
    const baseCommitSha = repo.manifestBaseSha;
    const manifest = repo.manifest;
    startTransition(async () => {
      const [health, installationId, source] = await Promise.all([
        localApi.engineHealth(),
        localApi.installationId(),
        getCloneSource({ repoId: repo._id }),
      ]);
      if (!health.available || !health.version) throw new Error(health.detail ?? 'Codex is not ready');
      const runId = await startRun({
        ticketId: ticket._id,
        baseCommitSha,
        desktopInstallationId: installationId,
        codexVersion: health.version,
      });
      await localApi.startRun({
        runId,
        task: ticket.body,
        baseCommitSha,
        manifest,
        repo: source,
      });
      await navigate({ to: '/runs/$runId', params: { runId } });
    });
  };

  return (
    <div className='grid min-w-0 gap-6 p-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]'>
      <Card className='min-w-0'>
        <CardHeader>
          <CardTitle>New task</CardTitle>
          <CardDescription>
            Codex edits a disposable checkout. Docker determines whether the result is verified.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaskForm
            title={title}
            body={body}
            disabled={isPending || !selectedRepo?.manifest}
            onTitleChange={setTitle}
            onBodyChange={setBody}
            onSubmit={createTask}
          />
        </CardContent>
      </Card>

      <Card className='min-w-0'>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
          <CardDescription>Task intent and compact summaries sync through Convex.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {tickets.map((ticket) => (
            <div
              key={ticket._id}
              className='flex items-center justify-between gap-3 rounded-lg border p-3'
            >
              <div className='min-w-0'>
                <p className='truncate font-medium'>{ticket.title}</p>
                <p className='text-muted-foreground text-xs'>{ticket.status}</p>
              </div>
              <Button
                size='sm'
                disabled={
                  isPending ||
                  !repos.find((repo) => repo._id === ticket.repoId)?.manifest
                }
                onClick={() => runTask(ticket)}
              >
                <Play data-icon='inline-start' />Run
              </Button>
            </div>
          ))}
          {tickets.length === 0 ? (
            <p className='text-muted-foreground text-sm'>No tasks yet.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
