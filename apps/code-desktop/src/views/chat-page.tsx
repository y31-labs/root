import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type { EngineHealth } from '@workspace/code-agent-contracts/engine';
import { ActivityRow } from '@workspace/ui/components/ai-elements/activity-row';
import {
  ApprovalRow,
  type ApprovalDecision,
} from '@workspace/ui/components/ai-elements/approval-row';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from '@workspace/ui/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@workspace/ui/components/ai-elements/message';
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@workspace/ui/components/ai-elements/prompt-input';
import { Button } from '@workspace/ui/components/ui/button';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@workspace/ui/components/ui/hover-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/ui/select';
import { Spinner } from '@workspace/ui/components/ui/spinner';
import {
  Archive,
  Bot,
  FolderGit2,
  FolderOpen,
  Plus,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import {
  getChatProvider,
  providerConnectionStatus,
  relativeUpdatedAt,
  repositoryName,
  type ProviderConnectionStatus,
} from '#/lib/chat-providers';
import {
  applyChatEvent,
  chatErrorMessage,
  emptyTranscript,
  resolveApproval,
  transcriptFromThread,
  type ChatProvider,
  type ChatThread,
  type ChatTranscript,
} from '#/lib/chat';
import { localApi } from '#/lib/local-api';
import { desktopLogger, errorCategory } from '#/lib/logging';

const starterPrompts = [
  'Inspect this repository and explain its architecture.',
  'Find the highest-impact issue in this project.',
  'Review the current changes and suggest improvements.',
];

export function ChatPage() {
  const [selectedProvider, setSelectedProvider] = useState<ChatProvider>('codex');
  const [providerHealth, setProviderHealth] = useState<EngineHealth>();
  const [providerChecking, setProviderChecking] = useState(true);
  const [providerError, setProviderError] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [transcript, setTranscript] = useState<ChatTranscript>(emptyTranscript);
  const [input, setInput] = useState('');
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [creatingThread, setCreatingThread] = useState(false);
  const [archivingId, setArchivingId] = useState<string>();
  const [pendingApprovalId, setPendingApprovalId] = useState<string | number>();
  const [createError, setCreateError] = useState<string>();
  const selectedIdRef = useRef(selectedId);
  const provider = getChatProvider(selectedProvider);
  const connectionStatus = providerConnectionStatus(providerHealth, {
    checking: providerChecking,
    error: providerError,
  });
  const connected = connectionStatus === 'connected';
  const selected = threads.find((thread) => thread.id === selectedId);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (selected) setSelectedProvider(selected.provider);
  }, [selected]);

  const checkProviderHealth = useCallback(
    async (showChecking = true) => {
      if (showChecking) setProviderChecking(true);
      setProviderError(undefined);
      try {
        const health = await provider.checkHealth();
        setProviderHealth(health);
        return health;
      } catch (error) {
        if (showChecking) {
          desktopLogger.error('chat provider connection failed', {
            operation: 'health-check',
            provider: selectedProvider,
            errorCategory: errorCategory(error),
          });
        }
        setProviderError(chatErrorMessage(error));
        return undefined;
      } finally {
        if (showChecking) setProviderChecking(false);
      }
    },
    [provider],
  );

  useEffect(() => {
    void checkProviderHealth();
  }, [checkProviderHealth]);

  useEffect(() => {
    const refreshOnFocus = () => void checkProviderHealth(false);
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [checkProviderHealth]);

  useEffect(() => {
    if (!connecting) return;
    let attempts = 0;
    let stopped = false;
    const poll = async () => {
      attempts += 1;
      const health = await checkProviderHealth(false);
      if (stopped) return;
      if (health?.version && health.authenticated) {
        setConnecting(false);
        return;
      }
      if (attempts >= 30) {
        desktopLogger.warn('chat provider connection failed', {
          operation: 'login-poll',
          provider: selectedProvider,
          errorCategory: 'timeout',
        });
        setConnecting(false);
        setProviderError('Codex login was not detected. Finish login, then check again.');
      }
    };
    const interval = window.setInterval(() => void poll(), 2000);
    void poll();
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [checkProviderHealth, connecting]);

  const refreshThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const next = await localApi.listChatThreads();
      setThreads(next);
      setSelectedId((current) =>
        current && next.some((thread) => thread.id === current) ? current : next[0]?.id,
      );
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!connected) return;
    void refreshThreads().catch((error) => {
      desktopLogger.error('chat operation failed', {
        operation: 'list-threads',
        provider: selectedProvider,
        errorCategory: errorCategory(error),
      });
      setCreateError(chatErrorMessage(error));
    });
  }, [connected, refreshThreads, selectedProvider]);

  useEffect(() => {
    if (!connected || !selectedId) {
      setTranscript(emptyTranscript());
      return;
    }
    const requestedId = selectedId;
    let cancelled = false;
    setTranscriptLoading(true);
    void localApi
      .readChatThread(requestedId)
      .then((thread) => {
        if (!cancelled && selectedIdRef.current === requestedId) {
          setTranscript(transcriptFromThread(thread));
        }
      })
      .catch((error: unknown) => {
        desktopLogger.error('chat operation failed', {
          operation: 'read-thread',
          provider: selectedProvider,
          threadId: requestedId,
          errorCategory: errorCategory(error),
        });
        if (!cancelled && selectedIdRef.current === requestedId) {
          setTranscript({
            items: [],
            status: 'error',
            error: chatErrorMessage(error),
          });
        }
      })
      .finally(() => {
        if (!cancelled && selectedIdRef.current === requestedId) setTranscriptLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, selectedId, selectedProvider]);

  useEffect(() => {
    if (!connected || !selected) return;
    const providerThreadId = selected.providerThreadId;
    const threadId = selected.id;
    const unlisten = listen<unknown>('chat-event', ({ payload }) => {
      if (selectedIdRef.current !== threadId) return;
      setTranscript((current) => applyChatEvent(current, payload, providerThreadId));
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [connected, selected]);

  const connectProvider = async () => {
    if (connecting) return;
    setProviderError(undefined);
    setConnecting(true);
    try {
      await provider.connect();
    } catch (error) {
      desktopLogger.error('chat provider connection failed', {
        operation: 'connect',
        provider: selectedProvider,
        errorCategory: errorCategory(error),
      });
      setConnecting(false);
      setProviderError(chatErrorMessage(error));
    }
  };

  const createThread = async () => {
    if (!connected || creatingThread) return;
    setCreateError(undefined);
    let folder: string | null;
    try {
      folder = await open({
        directory: true,
        multiple: false,
        title: 'Choose chat workspace',
      });
    } catch (error) {
      desktopLogger.error('chat operation failed', {
        operation: 'choose-workspace',
        provider: selectedProvider,
        errorCategory: errorCategory(error),
      });
      setCreateError(chatErrorMessage(error));
      return;
    }
    if (!folder) return;
    setCreatingThread(true);
    try {
      const thread = await localApi.createChatThread(selectedProvider, folder);
      setThreads((current) => [thread, ...current]);
      setSelectedId(thread.id);
      setTranscript(emptyTranscript());
    } catch (error) {
      desktopLogger.error('chat operation failed', {
        operation: 'create-thread',
        provider: selectedProvider,
        errorCategory: errorCategory(error),
      });
      setCreateError(chatErrorMessage(error));
    } finally {
      setCreatingThread(false);
    }
  };

  const archiveThread = async (threadId: string) => {
    if (!connected || archivingId) return;
    setArchivingId(threadId);
    try {
      await localApi.archiveChatThread(threadId);
      await refreshThreads();
    } catch (error) {
      desktopLogger.error('chat operation failed', {
        operation: 'archive-thread',
        provider: selectedProvider,
        threadId,
        errorCategory: errorCategory(error),
      });
      setCreateError(chatErrorMessage(error));
    } finally {
      setArchivingId(undefined);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!connected || !selected || transcript.status === 'submitted') return;
    const threadId = selected.id;
    if (transcript.activeTurnId) {
      await localApi.interruptChatTurn(threadId, transcript.activeTurnId);
      return;
    }
    const text = input.trim();
    if (!text) return;
    setInput('');
    setTranscript((current) => ({ ...current, status: 'submitted', error: undefined }));
    try {
      await localApi.sendChatMessage(threadId, text);
      await refreshThreads();
    } catch (error) {
      desktopLogger.error('chat operation failed', {
        operation: 'send-message',
        provider: selectedProvider,
        threadId,
        errorCategory: errorCategory(error),
      });
      if (selectedIdRef.current !== threadId) return;
      setInput(text);
      setTranscript((current) => ({
        ...current,
        status: 'error',
        error: chatErrorMessage(error),
      }));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const decideApproval = async (
    requestId: string | number,
    method: string,
    decision: ApprovalDecision,
  ) => {
    if (!connected || pendingApprovalId !== undefined) return;
    setPendingApprovalId(requestId);
    try {
      await localApi.resolveChatApproval(requestId, method, decision);
      setTranscript((current) => ({
        ...current,
        items: resolveApproval(current.items, requestId),
      }));
    } finally {
      setPendingApprovalId(undefined);
    }
  };

  if (!connected) {
    return (
      <ProviderConnectionGate
        health={providerHealth}
        status={connectionStatus}
        error={providerError}
        connecting={connecting}
        onConnect={() => void connectProvider()}
        onRetry={() => void checkProviderHealth()}
      />
    );
  }

  return (
    <div className='flex min-h-0 flex-1 overflow-hidden'>
      <aside className='bg-sidebar flex w-64 max-w-[42%] shrink-0 flex-col border-r'>
        <div className='space-y-3 border-b p-3'>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-sm font-semibold'>Chats</span>
            <Button
              size='icon-sm'
              variant='ghost'
              aria-label='New chat'
              disabled={creatingThread}
              onClick={() => void createThread()}
            >
              {creatingThread ? <Spinner /> : <Plus />}
            </Button>
          </div>
          <ProviderSelector
            provider={selectedProvider}
            health={providerHealth}
            status={connectionStatus}
            onChange={setSelectedProvider}
          />
        </div>

        {createError ? (
          <div className='border-b px-3 py-2'>
            <p className='text-danger text-xs' role='alert'>
              {createError}
            </p>
          </div>
        ) : null}

        <div className='min-h-0 flex-1 overflow-y-auto p-2'>
          {threadsLoading && threads.length === 0 ? (
            <div className='text-muted-foreground flex items-center gap-2 px-2 py-3 text-xs'>
              <Spinner className='size-3.5' />
              Loading chats
            </div>
          ) : threads.length ? (
            <div className='space-y-1'>
              {threads.map((thread) => {
                const active = thread.id === selectedId;
                return (
                  <div
                    key={thread.id}
                    data-active={active}
                    className='group/thread hover:bg-accent focus-within:bg-accent flex items-center rounded-lg border border-transparent px-1 data-[active=true]:border-border data-[active=true]:bg-accent'
                  >
                    <button
                      type='button'
                      className='focus-visible:ring-ring min-w-0 flex-1 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-2'
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setSelectedId(thread.id)}
                    >
                      <span className='block truncate text-sm font-medium'>{thread.title}</span>
                      <span className='text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px]'>
                        <FolderGit2 className='size-3 shrink-0' />
                        <span className='truncate'>{repositoryName(thread.cwd)}</span>
                        <span aria-hidden='true'>·</span>
                        <span className='shrink-0'>{relativeUpdatedAt(thread.updatedAt)}</span>
                      </span>
                    </button>
                    <Button
                      size='icon-xs'
                      variant='ghost'
                      className='focus-visible:opacity-100 group-focus-within/thread:opacity-100 group-hover/thread:opacity-100 md:opacity-0'
                      aria-label={`Archive ${thread.title}`}
                      disabled={archivingId === thread.id}
                      onClick={() => void archiveThread(thread.id)}
                    >
                      {archivingId === thread.id ? <Spinner /> : <Archive />}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className='text-muted-foreground px-2 py-3 text-xs'>No chats yet.</p>
          )}
        </div>
      </aside>

      <section className='relative flex min-w-0 flex-1 flex-col'>
        {selected ? (
          <header className='flex shrink-0 items-center justify-between gap-4 border-b px-5 py-3'>
            <div className='flex min-w-0 items-center gap-3'>
              <div className='bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg'>
                <FolderGit2 className='size-4' />
              </div>
              <div className='min-w-0'>
                <h1 className='truncate text-sm font-semibold'>{repositoryName(selected.cwd)}</h1>
                <p className='text-muted-foreground truncate text-xs'>{selected.cwd}</p>
              </div>
            </div>
            <ProviderStatus
              provider={selected.provider}
              health={providerHealth}
              status={connectionStatus}
              showLabel
            />
          </header>
        ) : null}

        {selected ? (
          <>
            <Conversation className='flex flex-col'>
              {transcriptLoading ? (
                <ConversationEmptyState className='min-h-0'>
                  <div className='flex items-center gap-2'>
                    <Spinner />
                    Loading conversation
                  </div>
                </ConversationEmptyState>
              ) : transcript.items.length ? (
                <ConversationContent>
                  {transcript.items.map((item) => {
                    if (item.type === 'message') {
                      return (
                        <Message key={item.id} from={item.role}>
                          <MessageContent>
                            <MessageResponse>{item.text}</MessageResponse>
                          </MessageContent>
                        </Message>
                      );
                    }
                    if (item.type === 'activity') {
                      return (
                        <ActivityRow
                          key={item.id}
                          kind={item.kind}
                          label={item.label}
                          detail={item.detail}
                          complete={item.complete}
                        />
                      );
                    }
                    return (
                      <ApprovalRow
                        key={item.id}
                        title={item.resolved ? 'Approval resolved' : item.title}
                        detail={item.detail}
                        disabled={item.resolved || pendingApprovalId === item.requestId}
                        onDecision={(decision) =>
                          void decideApproval(item.requestId, item.method, decision)
                        }
                      />
                    );
                  })}
                  {transcript.status === 'streaming' ? (
                    <div
                      className='text-muted-foreground flex items-center gap-2 py-3 text-xs'
                      role='status'
                    >
                      <Spinner className='size-3.5' />
                      Codex is working
                    </div>
                  ) : null}
                  {transcript.error ? (
                    <div className='border-danger/30 bg-danger/5 text-danger my-2 rounded-lg border px-3 py-2 text-sm'>
                      {transcript.error}
                    </div>
                  ) : null}
                </ConversationContent>
              ) : (
                <ConversationEmptyState className='min-h-0'>
                  <div className='max-w-lg space-y-5'>
                    <div className='space-y-1.5'>
                      <Bot className='text-foreground mx-auto size-6' />
                      <h2 className='text-foreground text-base font-semibold'>
                        What should Codex do here?
                      </h2>
                      <p>Start with a prompt or choose one of these common tasks.</p>
                    </div>
                    <div className='grid gap-2 text-left'>
                      {starterPrompts.map((prompt) => (
                        <Button
                          key={prompt}
                          variant='outline'
                          className='h-auto justify-start whitespace-normal px-3 py-2.5 text-left'
                          onClick={() => setInput(prompt)}
                        >
                          {prompt}
                        </Button>
                      ))}
                    </div>
                  </div>
                </ConversationEmptyState>
              )}
            </Conversation>

            <div className='bg-background/90 sticky bottom-0 shrink-0 border-t px-4 py-3 backdrop-blur'>
              <div className='mx-auto w-full max-w-3xl'>
                <PromptInput className='overflow-hidden rounded-xl' onSubmit={submit}>
                  <PromptInputTextarea
                    value={input}
                    disabled={transcriptLoading}
                    aria-label={`Message ${provider.label}`}
                    placeholder={`Ask ${provider.label} to inspect or change this project...`}
                    onChange={(event) => setInput(event.currentTarget.value)}
                    onKeyDown={onKeyDown}
                  />
                  <PromptInputFooter>
                    <PromptInputTools>
                      <span className='text-muted-foreground flex min-w-0 items-center gap-1.5 px-1 text-[11px]'>
                        <FolderGit2 className='size-3 shrink-0' />
                        <span className='truncate'>{repositoryName(selected.cwd)}</span>
                        <span className='hidden sm:inline'>· Enter to send</span>
                      </span>
                    </PromptInputTools>
                    <PromptInputSubmit
                      status={transcript.status}
                      disabled={
                        transcriptLoading ||
                        (transcript.status === 'submitted' && !transcript.activeTurnId) ||
                        (!transcript.activeTurnId && !input.trim())
                      }
                    />
                  </PromptInputFooter>
                </PromptInput>
              </div>
            </div>
          </>
        ) : (
          <div className='flex min-h-0 flex-1 items-center justify-center px-6 text-center'>
            <div className='flex max-w-md flex-col items-center gap-4'>
              <div className='bg-muted flex size-11 items-center justify-center rounded-xl'>
                <FolderOpen className='size-5' />
              </div>
              <div className='space-y-1'>
                <h1 className='text-base font-semibold'>Open a repository</h1>
                <p className='text-muted-foreground text-sm'>
                  Choose a workspace to start a local {provider.label} conversation.
                </p>
              </div>
              <Button disabled={creatingThread} onClick={() => void createThread()}>
                {creatingThread ? <Spinner /> : <FolderOpen />}
                {creatingThread ? 'Opening repository...' : 'Choose repository'}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ProviderConnectionGate({
  health,
  status,
  error,
  connecting,
  onConnect,
  onRetry,
}: {
  health?: EngineHealth;
  status: ProviderConnectionStatus;
  error?: string;
  connecting: boolean;
  onConnect: () => void;
  onRetry: () => void;
}) {
  const provider = getChatProvider('codex');

  if (status === 'checking') {
    return (
      <div className='flex min-h-0 flex-1 items-center justify-center'>
        <div className='text-muted-foreground flex items-center gap-3 text-sm' role='status'>
          <Spinner />
          Checking Codex connection
        </div>
      </div>
    );
  }

  const unavailable = status === 'unavailable';
  const canConnect = status === 'disconnected';
  return (
    <section className='flex min-h-0 flex-1 items-center justify-center px-6 text-center'>
      <div className='border-border bg-card w-full max-w-md rounded-2xl border p-6 shadow-sm'>
        <div className='bg-muted mx-auto flex size-11 items-center justify-center rounded-xl'>
          <Terminal className='size-5' />
        </div>
        <div className='mt-4 space-y-1.5'>
          <h1 className='text-lg font-semibold'>
            {unavailable ? 'Codex CLI is required' : 'Codex is not connected'}
          </h1>
          <p className='text-muted-foreground text-sm'>
            {unavailable ? provider.installHelp : provider.description}
          </p>
        </div>
        {health?.version ? (
          <p className='text-muted-foreground mt-3 font-mono text-xs'>{health.version}</p>
        ) : null}
        {error ? (
          <p className='text-danger mt-4 text-sm' role='alert'>
            {error}
          </p>
        ) : null}
        <div className='mt-5 flex justify-center gap-2'>
          {canConnect ? (
            <Button disabled={connecting} onClick={onConnect}>
              {connecting ? <Spinner /> : <Bot />}
              {connecting ? 'Waiting for login...' : provider.connectLabel}
            </Button>
          ) : null}
          <Button variant='outline' disabled={connecting} onClick={onRetry}>
            <RefreshCw />
            Check again
          </Button>
        </div>
        {connecting ? (
          <p className='text-muted-foreground mt-4 text-xs'>
            Finish signing in from the Codex login window. Chat will open automatically.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ProviderSelector({
  provider,
  health,
  status,
  onChange,
}: {
  provider: ChatProvider;
  health?: EngineHealth;
  status: ProviderConnectionStatus;
  onChange: (provider: ChatProvider) => void;
}) {
  return (
    <div className='flex items-center gap-2'>
      <Select
        value={provider}
        onValueChange={(value) => {
          if (value) onChange(value as ChatProvider);
        }}
      >
        <SelectTrigger size='sm' className='min-w-0 flex-1' aria-label='Chat provider'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align='start'>
          <SelectItem value='codex'>
            <Bot />
            Codex
          </SelectItem>
        </SelectContent>
      </Select>
      <ProviderStatus provider={provider} health={health} status={status} />
    </div>
  );
}

function ProviderStatus({
  provider,
  health,
  status,
  showLabel = false,
}: {
  provider: ChatProvider;
  health?: EngineHealth;
  status: ProviderConnectionStatus;
  showLabel?: boolean;
}) {
  const definition = getChatProvider(provider);
  const statusLabel = providerStatusLabel(status);
  const statusTone =
    status === 'connected'
      ? 'bg-success'
      : status === 'checking'
        ? 'bg-muted-foreground'
        : status === 'error'
          ? 'bg-danger'
          : 'bg-warning';

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button
          type='button'
          className='focus-visible:ring-ring hover:bg-accent flex shrink-0 items-center gap-2 rounded-lg px-2 py-1 text-xs outline-none focus-visible:ring-2'
          aria-label={`${definition.label}: ${statusLabel}`}
          />
        }
      >
        <span className={`size-2 rounded-full ${statusTone}`} aria-hidden='true' />
        {showLabel ? (
          <span className='text-muted-foreground hidden whitespace-nowrap sm:inline'>
            {definition.label} {statusLabel.toLowerCase()}
          </span>
        ) : null}
      </HoverCardTrigger>
      <HoverCardContent align='end' className='space-y-2'>
        <div>
          <p className='font-medium'>
            {definition.label} · {statusLabel}
          </p>
          <p className='text-muted-foreground mt-1 text-xs'>{definition.description}</p>
        </div>
        {health?.version ? (
          <p className='text-muted-foreground border-t pt-2 font-mono text-xs'>{health.version}</p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

function providerStatusLabel(status: ProviderConnectionStatus) {
  switch (status) {
    case 'checking':
      return 'Checking';
    case 'unavailable':
      return 'Unavailable';
    case 'disconnected':
      return 'Disconnected';
    case 'connected':
      return 'Connected';
    case 'error':
      return 'Connection error';
  }
}
