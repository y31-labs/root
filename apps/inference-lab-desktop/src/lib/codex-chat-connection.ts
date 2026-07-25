import type { RunAgentInputContext, SubscribeConnectionAdapter } from '@tanstack/ai-react';
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
  CodexRunInfo,
} from '#/lib/types';

export const CODEX_ACTIVITY_EVENT = 'codex.activity';
export const CODEX_ACTIVITY_DELTA_EVENT = 'codex.activity-delta';
export const CODEX_APPROVAL_EVENT = 'codex.approval';
export const CODEX_REASONING_DELTA_EVENT = 'codex.reasoning-delta';

const TEXT_PART_PREFIX = 'codex-text:';

interface CodexChatRequestConfig {
  chatId?: string;
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
  api: Pick<LocalApi, 'getCodexRun' | 'interruptCodexTurn' | 'startCodexText' | 'streamCodexRun'>;
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

  const closeTextMessages = () => {
    const chunks: StreamChunk[] = [];
    for (const messageId of openTextMessageIds) {
      chunks.push({ type: EventType.TEXT_MESSAGE_END, messageId });
    }
    openTextMessageIds.clear();
    return chunks;
  };

  const finish = (): StreamChunk[] => {
    if (completed) return [];
    const chunks = [...startRun(), ...closeTextMessages()];

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

  const fail = (message: string): StreamChunk[] => {
    if (completed) return [];
    const chunks = [...startRun(), ...closeTextMessages()];
    chunks.push({
      type: EventType.RUN_ERROR,
      threadId: options.threadId,
      runId: options.runId,
      timestamp: Date.now(),
      message,
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
    fail,
    finish,
    translate,
  };
};

export class CodexChatConnection implements SubscribeConnectionAdapter {
  readonly #api: Pick<
    LocalApi,
    'getCodexRun' | 'interruptCodexTurn' | 'startCodexText' | 'streamCodexRun'
  >;
  readonly #getConfig: () => CodexChatRequestConfig;
  readonly #onMissingCompletion: () => void;
  #chatId: string | undefined;
  #codexThreadId: string | undefined;
  #generation = 0;
  #activeRun: CodexRunInfo | undefined;
  #pendingSubmission: CodexChatSubmission | undefined;
  #subscriber: AsyncQueue<StreamChunk> | undefined;

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
    this.#subscriber?.clear();
    this.#activeRun = undefined;
    this.#chatId = undefined;
    this.#codexThreadId = undefined;
    this.#pendingSubmission = undefined;
  }

  restoreChat(chatId: string, threadId: string | undefined, run?: CodexRunInfo) {
    this.#generation += 1;
    this.#subscriber?.clear();
    this.#chatId = chatId;
    this.#codexThreadId = threadId;
    this.#activeRun = run;
    this.#pendingSubmission = undefined;
    if (run) this.#pumpRun(run);
  }

  subscribe(abortSignal?: AbortSignal): AsyncIterable<StreamChunk> {
    const queue = new AsyncQueue<StreamChunk>();
    this.#subscriber?.close();
    this.#subscriber = queue;
    const close = () => {
      if (this.#subscriber === queue) this.#subscriber = undefined;
      queue.close();
    };
    if (abortSignal?.aborted) {
      close();
      return queue;
    }
    abortSignal?.addEventListener('abort', close, { once: true });

    const activeRun = this.#activeRun;
    if (activeRun) {
      this.#pumpRun(activeRun);
    } else if (this.#chatId) {
      const generation = this.#generation;
      void this.#api
        .getCodexRun(this.#chatId)
        .then((run) => {
          if (!run || generation !== this.#generation || this.#subscriber !== queue) return;
          this.#activeRun = run;
          this.#pumpRun(run);
        })
        .catch(() => undefined);
    }
    return queue;
  }

  async send(
    _messages: UIMessage[] | ModelMessage[],
    _data?: Record<string, unknown>,
    abortSignal?: AbortSignal,
    _runContext?: RunAgentInputContext,
  ): Promise<void> {
    const submission = this.#pendingSubmission;
    this.#pendingSubmission = undefined;
    if (!submission) throw new Error('No Codex submission was prepared for this request.');

    const config = this.#getConfig();
    const chatId = config.chatId ?? this.#chatId;
    if (!chatId) throw new Error('No chat identity is available for this request.');
    this.#chatId = chatId;
    const codexThreadId = this.#codexThreadId;
    const run = await this.#api.startCodexText(
      chatId,
      submission.assistantMessageId,
      submission.text,
      submission.attachments,
      config.workingDirectory,
      codexThreadId,
      config.settings,
      config.permissionMode,
    );
    this.#codexThreadId = run.threadId;
    this.#activeRun = run;
    if (!abortSignal?.aborted) this.#pumpRun(run);
  }

  interruptActive() {
    const run = this.#activeRun;
    if (!run) return;
    this.#generation += 1;
    this.#subscriber?.clear();
    this.#activeRun = undefined;
    void this.#api.interruptCodexTurn(run.threadId, run.turnId).catch(() => undefined);
  }

  #pumpRun(run: CodexRunInfo) {
    const subscriber = this.#subscriber;
    if (!subscriber) return;
    const generation = ++this.#generation;
    const translator = createCodexStreamTranslator({
      assistantMessageId: run.assistantMessageId,
      ...(run.model !== undefined ? { model: run.model } : {}),
      runId: run.runId,
      threadId: run.chatId,
    });
    const push = (chunks: StreamChunk[]) => {
      if (generation !== this.#generation || subscriber !== this.#subscriber) return;
      for (const chunk of chunks) subscriber.push(chunk);
    };

    void this.#api
      .streamCodexRun(run.runId, (event) => push(translator.translate(event)))
      .then((result) => {
        if (generation !== this.#generation || subscriber !== this.#subscriber) return;
        this.#codexThreadId = result.threadId;
        this.#activeRun = undefined;
        if (!translator.completed) {
          this.#onMissingCompletion();
          push(translator.finish());
        }
      })
      .catch((error: unknown) => {
        if (generation !== this.#generation || subscriber !== this.#subscriber) return;
        this.#activeRun = undefined;
        push(translator.fail(toError(error).message));
      });
  }
}

class AsyncQueue<T> implements AsyncIterable<T>, AsyncIterator<T> {
  readonly #buffer: T[] = [];
  readonly #waiters: Array<(result: IteratorResult<T>) => void> = [];
  #closed = false;

  [Symbol.asyncIterator]() {
    return this;
  }

  next(): Promise<IteratorResult<T>> {
    const value = this.#buffer.shift();
    if (value !== undefined) return Promise.resolve({ done: false, value });
    if (this.#closed) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => this.#waiters.push(resolve));
  }

  return(): Promise<IteratorResult<T>> {
    this.close();
    return Promise.resolve({ done: true, value: undefined });
  }

  push(value: T) {
    if (this.#closed) return;
    const waiter = this.#waiters.shift();
    if (waiter) waiter({ done: false, value });
    else this.#buffer.push(value);
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }
  }

  clear() {
    this.#buffer.splice(0);
  }
}

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The Codex request failed.');

const assertNever = (_value: never): never => {
  throw new Error('Unsupported Codex stream event.');
};
