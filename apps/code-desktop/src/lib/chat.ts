export type ChatProvider = 'codex';

export interface ChatThread {
  id: string;
  provider: ChatProvider;
  providerThreadId: string;
  cwd: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export type ChatItem =
  | { id: string; type: 'message'; role: 'user' | 'assistant'; text: string }
  | {
      id: string;
      type: 'activity';
      kind: 'command' | 'file' | 'error' | 'status';
      label: string;
      detail?: string;
      complete: boolean;
    }
  | {
      id: string;
      type: 'approval';
      requestId: string | number;
      method: string;
      title: string;
      detail?: string;
      resolved: boolean;
    };

export interface ChatTranscript {
  items: ChatItem[];
  activeTurnId?: string;
  status: 'ready' | 'submitted' | 'streaming' | 'error';
  error?: string;
}

export const emptyTranscript = (): ChatTranscript => ({ items: [], status: 'ready' });

type RecordValue = Record<string, unknown>;

export function chatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unable to create chat');
}

export function transcriptFromThread(value: unknown): ChatTranscript {
  const thread = record(record(value)?.thread);
  const turns = array(thread?.turns);
  const items = turns.flatMap((turn) =>
    array(record(turn)?.items).flatMap((item) => mapThreadItem(record(item))),
  );
  return { items, status: 'ready' };
}

export function applyChatEvent(
  transcript: ChatTranscript,
  event: unknown,
  providerThreadId: string,
): ChatTranscript {
  const message = record(event);
  const method = string(message?.method);
  const params = record(message?.params);
  const eventThreadId = string(params?.threadId);
  if (eventThreadId && eventThreadId !== providerThreadId) return transcript;

  if (method === 'turn/started') {
    const turn = record(params?.turn);
    return {
      ...transcript,
      activeTurnId: string(turn?.id),
      status: 'streaming',
      error: undefined,
    };
  }

  if (method === 'turn/completed') {
    return { ...transcript, activeTurnId: undefined, status: 'ready' };
  }

  if (method === 'item/started' || method === 'item/completed') {
    const item = record(params?.item);
    const mapped = mapThreadItem(item, method === 'item/completed');
    return { ...transcript, items: mergeItems(transcript.items, mapped), status: 'streaming' };
  }

  if (method === 'item/agentMessage/delta') {
    const itemId = string(params?.itemId);
    const delta = string(params?.delta);
    if (!itemId || !delta) return transcript;
    const existing = transcript.items.find((item) => item.id === itemId && item.type === 'message');
    const next: ChatItem = {
      id: itemId,
      type: 'message',
      role: 'assistant',
      text: existing?.type === 'message' ? existing.text + delta : delta,
    };
    return { ...transcript, items: mergeItems(transcript.items, [next]), status: 'streaming' };
  }

  if (
    method === 'item/commandExecution/requestApproval' ||
    method === 'item/fileChange/requestApproval'
  ) {
    const requestId = requestIdValue(message?.id);
    if (requestId === undefined) return transcript;
    const command = string(params?.command);
    const reason = string(params?.reason);
    const changes = array(params?.changes)
      .map((change) => string(record(change)?.path))
      .filter(Boolean)
      .join('\n');
    const approval: ChatItem = {
      id: `approval-${requestId}`,
      type: 'approval',
      requestId,
      method,
      title: method.includes('commandExecution') ? 'Allow command?' : 'Allow file changes?',
      detail: command || reason || changes || undefined,
      resolved: false,
    };
    return { ...transcript, items: mergeItems(transcript.items, [approval]) };
  }

  if (method === 'error') {
    const error = string(params?.message) || 'Codex encountered an error';
    return {
      ...transcript,
      status: 'error',
      error,
      items: mergeItems(transcript.items, [
        {
          id: `error-${Date.now()}`,
          type: 'activity',
          kind: 'error',
          label: error,
          complete: true,
        },
      ]),
    };
  }

  return transcript;
}

export function resolveApproval(items: ChatItem[], requestId: string | number) {
  return items.map((item) =>
    item.type === 'approval' && item.requestId === requestId ? { ...item, resolved: true } : item,
  );
}

function mapThreadItem(item: RecordValue | undefined, complete = true): ChatItem[] {
  const id = string(item?.id);
  const type = string(item?.type);
  if (!id || !type) return [];

  if (type === 'userMessage') {
    const text = array(item?.content)
      .map((content) => string(record(content)?.text))
      .filter(Boolean)
      .join('\n');
    return text ? [{ id, type: 'message', role: 'user', text }] : [];
  }
  if (type === 'agentMessage') {
    const text = string(item?.text);
    return text ? [{ id, type: 'message', role: 'assistant', text }] : [];
  }
  if (type === 'commandExecution') {
    return [
      {
        id,
        type: 'activity',
        kind: 'command',
        label: string(item?.command) || 'Running command',
        detail: string(item?.aggregatedOutput) || undefined,
        complete,
      },
    ];
  }
  if (type === 'fileChange') {
    const paths = array(item?.changes)
      .map((change) => string(record(change)?.path))
      .filter(Boolean);
    return [
      {
        id,
        type: 'activity',
        kind: 'file',
        label: paths.length ? `Changed ${paths.join(', ')}` : 'Updating files',
        complete,
      },
    ];
  }
  return [];
}

function mergeItems(current: ChatItem[], incoming: ChatItem[]) {
  const next = [...current];
  for (const item of incoming) {
    const index = next.findIndex((candidate) => candidate.id === item.id);
    if (index === -1) next.push(item);
    else next[index] = item;
  }
  return next;
}

function record(value: unknown): RecordValue | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function requestIdValue(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}
