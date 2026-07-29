import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@workspace/ui/components/ui/button';
import { ArrowLeft, MessageSquareText } from 'lucide-react';
import { useEffect, useState } from 'react';

import { GeneratedAppHost } from '#/features/apps/generated-app-host';
import type { GeneratedAppRecord } from '#/lib/local-api';
import { useChatHistory } from '#/providers/chat-history-provider';
import { useLocalApi } from '#/providers/local-api-provider';

export const Route = createFileRoute('/apps/$appId')({ component: GeneratedAppRoute });

function GeneratedAppRoute() {
  const { appId } = Route.useParams();
  const api = useLocalApi();
  const chatHistory = useChatHistory();
  const navigate = useNavigate();
  const [app, setApp] = useState<GeneratedAppRecord>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void api
      .getGeneratedApp(appId)
      .then((record) => {
        if (!active) return;
        if (!record) {
          setError('This local app does not exist.');
          return;
        }
        setApp(record);
        setError(undefined);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load local app.');
        }
      });
    return () => {
      active = false;
    };
  }, [api, appId]);

  const openAuthoringChat = () => {
    if (!app) return;
    chatHistory.openChat(app.authoringChatId);
    void navigate({ to: '/' });
  };

  return (
    <main className='min-h-0 flex-1 overflow-y-auto bg-background text-foreground'>
      <header className='sticky top-0 z-10 flex min-h-14 items-center justify-between gap-4 border-b bg-background/95 px-5 backdrop-blur md:px-8'>
        <div className='flex min-w-0 items-center gap-3'>
          <Button
            nativeButton={false}
            size='icon-sm'
            variant='ghost'
            aria-label='Back to chat'
            render={<Link to='/' />}
          >
            <ArrowLeft />
          </Button>
          <div className='min-w-0 py-2'>
            <h1 className='truncate text-sm font-medium'>{app?.title ?? 'Local app'}</h1>
            {app ? (
              <p className='truncate text-xs text-muted-foreground'>
                Local revision {app.revision}
              </p>
            ) : null}
          </div>
        </div>
        {app ? (
          <Button size='sm' variant='outline' onClick={openAuthoringChat}>
            <MessageSquareText />
            Edit in chat
          </Button>
        ) : null}
      </header>
      {error ? (
        <div className='mx-auto max-w-3xl px-6 py-10'>
          <p className='text-danger' role='alert'>
            {error}
          </p>
        </div>
      ) : app ? (
        <GeneratedAppHost api={api} app={app} key={`${app.id}:${app.revision}`} />
      ) : (
        <p className='px-6 py-10 text-sm text-muted-foreground'>Loading local app…</p>
      )}
    </main>
  );
}
