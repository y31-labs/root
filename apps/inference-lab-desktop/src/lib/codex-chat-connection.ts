import type { ConnectConnectionAdapter, RunAgentInputContext } from '@tanstack/ai-react';
import { EventType } from '@tanstack/ai/client';
import type { ModelMessage, StreamChunk, UIMessage } from '@tanstack/ai/client';

import type { ChatAttachmentInput, LocalApi } from '#/lib/local-api';
import type {
  ChatStreamEvent,
  CodexActivityCustomEventPayload,
  CodexActivityDeltaCustomEventPayload,
  CodexApprovalCustomEventPayload,
  CodexReasoningDeltaCustomEventPayload,
  ModelSettings,
  PermissionMode,
} from '#/lib/types';

export const CODEX_ACTIVITY_EVENT = 'codex.activity';
export const CODEX_ACTIVITY_DELTA_EVENT = 'codex.activity-delta';
export const CODEX_APPROVAL_EVENT = 'codex.approval';
export const CODEX_REASONING_DELTA_EVENT = 'codex.reasoning-delta';

const TEXT_PART_PREFIX = 'codex-text:';

interface CodexChatRequestConfig {
  permissionMode: PermissionMode;
  settings?: ModelSettings;
  workingDirectory?: string;
}

export interface CodexChatSubmission {
  assistantMessageId: string;
  attachments: ChatAttachmentInput[];
  id: string;
  text: string;
}

interface CodexChatConnectionOptions {
  api: Pick<LocalApi, 'interruptCodexTurn' | 'streamChatText'>;
  getConfig: () => CodexChatRequestConfig;
  onMissingCompletion?: () => void;
}

interface TranslatorOptions {
  assistantMessageId: string;
  model?: string;
  runId: string;
  threadId: string;
}

export interface CodexTextPartIdentity {
  assistantMessageId: string;
  id: string;
}

export const createCodexTextPartId = (assistantMessageId: string, id: string) =>
  `${TEXT_PART_PREFIX}${encodeURIComponent(assistantMessageId)}:${encodeURIComponent(id)}`;

export const parseCodexTextPartId = (partId: string): CodexTextPartIdentity | undefined => {
  if (!partId.startsWith(TEXT_PART_PREFIX)) return undefined;
  const identity = partId.slice(TEXT_PART_PREFIX.length).split(':');
  if (identity.length !== 2 || !identity[0] || !identity[1]) return undefined;
  try {
    return {
      assistantMessageId: decodeURIComponent(identity[0]),
      id: decodeURIComponent(identity[1]),
    };
  } catch {
    return undefined;
  }
};

export const createCodexStreamTranslator = (options: TranslatorOptions) => {
  const openTextMessageIds = new Set<string>();
  let completed = false;
  let started = false;

  const startRun = (): StreamChunk[] => {
    if (started) return [];
    started = true;
    return [
      {
        type: EventType.RUN_STARTED,
        threadId: options.threadId,
        runId: options.runId,
        ...(options.model !== undefined ? { model: options.model } : {}),
        timestamp: Date.now(),
      },
    ];
  };

  const finish = (): StreamChunk[] => {
    if (completed) return [];
    const chunks = startRun();

    for (const messageId of openTextMessageIds) {
      chunks.push({ type: EventType.TEXT_MESSAGE_END, messageId });
    }
    openTextMessageIds.clear();

    chunks.push({
      type: EventType.RUN_FINISHED,
      threadId: options.threadId,
      runId: options.runId,
      ...(options.model !== undefined ? { model: options.model } : {}),
      timestamp: Date.now(),
      finishReason: 'stop',
    });
    completed = true;
    return chunks;
  };

  const translate = (event: ChatStreamEvent): StreamChunk[] => {
    if (completed) return [];

    if (event.type === 'started') return startRun();

    const chunks = startRun();
    if (event.type === 'messageDelta') {
      const messageId = createCodexTextPartId(options.assistantMessageId, event.id);
      if (!openTextMessageIds.has(messageId)) {
        openTextMessageIds.add(messageId);
        chunks.push({
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
        });
      }
      chunks.push({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: event.text,
      });
      return chunks;
    }

    if (event.type === 'reasoningDelta') {
      const value: CodexReasoningDeltaCustomEventPayload = {
        assistantMessageId: options.assistantMessageId,
        id: event.id,
        summaryIndex: event.summaryIndex,
        delta: event.text,
      };
      chunks.push({ type: EventType.CUSTOM, name: CODEX_REASONING_DELTA_EVENT, value });
      return chunks;
    }

    if (event.type === 'activity') {
      const value: CodexActivityCustomEventPayload = {
        assistantMessageId: options.assistantMessageId,
        activity: {
          id: event.id,
          kind: event.kind,
          label: event.label,
          ...(event.detail !== undefined ? { detail: event.detail } : {}),
          ...(event.items !== undefined ? { items: event.items } : {}),
          status: event.status,
        },
      };
      chunks.push({ type: EventType.CUSTOM, name: CODEX_ACTIVITY_EVENT, value });
      return chunks;
    }

    if (event.type === 'activityDelta') {
      const value: CodexActivityDeltaCustomEventPayload = {
        assistantMessageId: options.assistantMessageId,
        id: event.id,
        delta: event.delta,
      };
      chunks.push({ type: EventType.CUSTOM, name: CODEX_ACTIVITY_DELTA_EVENT, value });
      return chunks;
    }

    if (event.type === 'approval') {
      const value: CodexApprovalCustomEventPayload = {
        assistantMessageId: options.assistantMessageId,
        approval: {
          requestId: event.requestId,
          method: event.method,
          title: event.title,
          ...(event.detail !== undefined ? { detail: event.detail } : {}),
        },
      };
      chunks.push({ type: EventType.CUSTOM, name: CODEX_APPROVAL_EVENT, value });
      return chunks;
    }

    if (event.type === 'completed') return [...chunks, ...finish()];
    return assertNever(event);
  };

  return {
    get completed() {
      return completed;
    },
    finish,
    translate,
  };
};

export class CodexChatConnection implements ConnectConnectionAdapter {
  readonly #api: Pick<LocalApi, 'interruptCodexTurn' | 'streamChatText'>;
  readonly #getConfig: () => CodexChatRequestConfig;
  readonly #onMissingCompletion: () => void;
  #codexThreadId: string | undefined;
  #generation = 0;
  #cancelActive: (() => void) | undefined;
  #pendingSubmission: CodexChatSubmission | undefined;

  constructor({ api, getConfig, onMissingCompletion }: CodexChatConnectionOptions) {
    this.#api = api;
    this.#getConfig = getConfig;
    this.#onMissingCompletion =
      onMissingCompletion ?? (() => console.warn('Codex stream ended without a completed event.'));
  }

  get threadId() {
    return this.#codexThreadId;
  }

  prepareSubmission(submission: CodexChatSubmission) {
    this.#pendingSubmission = submission;
  }

  discardSubmission(id: string) {
    if (this.#pendingSubmission?.id === id) this.#pendingSubmission = undefined;
  }

  resetThread() {
    this.#generation += 1;
    this.#cancelActive?.();
    this.#cancelActive = undefined;
    this.#codexThreadId = undefined;
    this.#pendingSubmission = undefined;
  }

  connect(
    _messages: UIMessage[] | ModelMessage[],
    _data?: Record<string, unknown>,
    abortSignal?: AbortSignal,
    runContext?: RunAgentInputContext,
  ): AsyncIterable<StreamChunk> {
    const submission = this.#pendingSubmission;
    this.#pendingSubmission = undefined;
    if (!submission) throw new Error('No Codex submission was prepared for this request.');

    const config = this.#getConfig();
    this.#cancelActive?.();
    const generation = ++this.#generation;
    const codexThreadId = this.#codexThreadId;
    const queue = new AsyncQueue<StreamChunk>();
    const translator = createCodexStreamTranslator({
      assistantMessageId: submission.assistantMessageId,
      ...(config.settings?.model !== undefined ? { model: config.settings.model } : {}),
      runId: runContext?.runId ?? createCorrelationId('run'),
      threadId: runContext?.threadId ?? createCorrelationId('thread'),
    });
    let inactive = false;
    let cancelRequested = false;
    let interrupted = false;
    let turn: { threadId: string; turnId: string } | undefined;

    const interrupt = () => {
      if (!turn || interrupted) return;
      interrupted = true;
      void this.#api.interruptCodexTurn(turn.threadId, turn.turnId).catch(() => undefined);
    };

    const cleanup = () => {
      abortSignal?.removeEventListener('abort', cancel);
      if (this.#cancelActive === cancel) this.#cancelActive = undefined;
    };

    const close = () => {
      if (inactive) return;
      inactive = true;
      cleanup();
      queue.close();
    };
    const cancel = () => {
      if (inactive) return;
      cancelRequested = true;
      inactive = true;
      cleanup();
      interrupt();
      queue.cancel();
    };
    this.#cancelActive = cancel;

    if (abortSignal?.aborted) {
      cancel();
      return queue;
    }
    abortSignal?.addEventListener('abort', cancel, { once: true });

    const push = (chunks: StreamChunk[]) => {
      if (inactive) return;
      for (const chunk of chunks) queue.push(chunk);
    };
    const handleEvent = (event: ChatStreamEvent) => {
      if (event.type === 'started') {
        turn = { threadId: event.threadId, turnId: event.turnId };
        if (cancelRequested || generation !== this.#generation) {
          interrupt();
          return;
        }
        this.#codexThreadId = event.threadId;
      }
      if (inactive || generation !== this.#generation) return;
      push(translator.translate(event));
    };

    void this.#api
      .streamChatText(
        submission.text,
        submission.attachments,
        config.workingDirectory,
        codexThreadId,
        config.settings,
        config.permissionMode,
        handleEvent,
      )
      .then((result) => {
        if (inactive || generation !== this.#generation) {
          cleanup();
          return;
        }
        this.#codexThreadId = result.threadId;
        if (!translator.completed) {
          this.#onMissingCompletion();
          push(translator.finish());
        }
        close();
      })
      .catch((error: unknown) => {
        if (inactive || generation !== this.#generation) {
          cleanup();
          return;
        }
        inactive = true;
        cleanup();
        queue.fail(toError(error));
      });

    return queue;
  }
}

class AsyncQueue<T> implements AsyncIterable<T>, AsyncIterator<T> {
  readonly #buffer: T[] = [];
  readonly #waiters: Array<{
    reject: (error: Error) => void;
    resolve: (result: IteratorResult<T>) => void;
  }> = [];
  #closed = false;
  #error: Error | undefined;

  [Symbol.asyncIterator]() {
    return this;
  }

  next(): Promise<IteratorResult<T>> {
    const value = this.#buffer.shift();
    if (value !== undefined) return Promise.resolve({ done: false, value });
    if (this.#error) return Promise.reject(this.#error);
    if (this.#closed) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve, reject) => this.#waiters.push({ reject, resolve }));
  }

  return(): Promise<IteratorResult<T>> {
    this.close();
    return Promise.resolve({ done: true, value: undefined });
  }

  push(value: T) {
    if (this.#closed || this.#error) return;
    const waiter = this.#waiters.shift();
    if (waiter) waiter.resolve({ done: false, value });
    else this.#buffer.push(value);
  }

  close() {
    if (this.#closed || this.#error) return;
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter.resolve({ done: true, value: undefined });
    }
  }

  cancel() {
    if (this.#closed || this.#error) return;
    this.#buffer.splice(0);
    this.close();
  }

  fail(error: Error) {
    if (this.#closed || this.#error) return;
    this.#error = error;
    if (this.#buffer.length > 0) return;
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
  }
}

const createCorrelationId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The Codex request failed.');

const assertNever = (_value: never): never => {
  throw new Error('Unsupported Codex stream event.');
};
