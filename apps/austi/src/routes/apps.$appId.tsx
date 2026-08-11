import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button } from '@workspace/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/ui/dropdown-menu';
import { useSidebar } from '@workspace/ui/components/ui/sidebar';
import { Ellipsis, MessageSquareText } from 'lucide-react';
import { useEffect, useState } from 'react';

import { GeneratedAppHost } from '#/features/apps/generated-app-host';
import type { GeneratedAppRecord } from '#/lib/local-api';
import { useChatHistory } from '#/providers/chat-history-provider';
import { useLocalApi } from '#/providers/local-api-provider';

export const Route = createFileRoute('/apps/$appId')({ component: GeneratedAppRoute });

const appHeaderInlineStart =
  'max(1rem, calc(var(--window-app-header-inline-start) - (100vw - 100%)))';

function GeneratedAppRoute() {
  const { appId } = Route.useParams();
  const api = useLocalApi();
  const chatHistory = useChatHistory();
  const navigate = useNavigate();
  const { setOpen: setSidebarOpen } = useSidebar();
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
    setSidebarOpen(true);
    chatHistory.openChat(app.authoringChatId);
    void navigate({ to: '/' });
  };

  return (
    <main className='flex min-h-0 flex-1 flex-col bg-background text-foreground'>
      <header
        data-tauri-drag-region
        className='absolute inset-x-0 top-0 z-60 flex h-(--window-titlebar-height) items-center gap-4 bg-background/95 pr-(--window-control-inline-inset) backdrop-blur'
        style={{ paddingInlineStart: appHeaderInlineStart }}
      >
        <h1 data-tauri-drag-region className='min-w-0 flex-1 truncate text-sm font-medium'>
          {app?.title ?? 'Local app'}
        </h1>
        <div data-tauri-drag-region className='ml-auto flex shrink-0 items-center'>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              render={
                <Button size='icon-sm' variant='ghost' aria-label='App actions'>
                  <Ellipsis />
                </Button>
              }
            />
            <DropdownMenuContent align='end' className='w-40'>
              <DropdownMenuItem disabled={!app} onClick={openAuthoringChat}>
                <MessageSquareText />
                Edit in chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className='min-h-0 flex-1 overflow-y-auto'>
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
      </div>
    </main>
  );
}
