import type { RunAgentInputContext, SubscribeConnectionAdapter } from '@tanstack/ai-react';
import type { ModelMessage, StreamChunk, UIMessage } from '@tanstack/ai/client';

import { createAsyncQueue, type AsyncQueue } from '#/lib/async-queue';
import { createCodexStreamTranslator } from '#/lib/codex-stream-translator';
import type { ChatAttachmentInput, LocalApi } from '#/lib/local-api';
import type { CodexRunInfo, ModelSettings, PermissionMode } from '#/lib/types';

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

export interface CodexChatConnection extends SubscribeConnectionAdapter {
  readonly threadId: string | undefined;
  discardSubmission: (id: string) => void;
  interruptActive: () => void;
  prepareSubmission: (submission: CodexChatSubmission) => void;
  resetThread: () => void;
  restoreChat: (chatId: string, threadId: string | undefined, run?: CodexRunInfo) => void;
}

export const createCodexChatConnection = ({
  api,
  getConfig,
  onMissingCompletion = () => console.warn('Codex stream ended without a completed event.'),
}: CodexChatConnectionOptions): CodexChatConnection => {
  let chatId: string | undefined;
  let codexThreadId: string | undefined;
  let generation = 0;
  let activeRun: CodexRunInfo | undefined;
  let pendingSubmission: CodexChatSubmission | undefined;
  let subscriber: AsyncQueue<StreamChunk> | undefined;

  const pumpRun = (run: CodexRunInfo) => {
    const activeSubscriber = subscriber;
    if (!activeSubscriber) return;
    const runGeneration = ++generation;
    const translator = createCodexStreamTranslator({
      assistantMessageId: run.assistantMessageId,
      ...(run.model !== undefined ? { model: run.model } : {}),
      runId: run.runId,
      threadId: run.chatId,
    });
    const push = (chunks: StreamChunk[]) => {
      if (runGeneration !== generation || activeSubscriber !== subscriber) return;
      for (const chunk of chunks) activeSubscriber.push(chunk);
    };

    void api
      .streamCodexRun(run.runId, (event) => push(translator.translate(event)))
      .then((result) => {
        if (runGeneration !== generation || activeSubscriber !== subscriber) return;
        codexThreadId = result.threadId;
        activeRun = undefined;
        if (!translator.completed) {
          onMissingCompletion();
          push(translator.finish());
        }
      })
      .catch((error: unknown) => {
        if (runGeneration !== generation || activeSubscriber !== subscriber) return;
        activeRun = undefined;
        push(translator.fail(toError(error).message));
      });
  };

  const subscribe = (abortSignal?: AbortSignal): AsyncIterable<StreamChunk> => {
    const queue = createAsyncQueue<StreamChunk>();
    subscriber?.close();
    subscriber = queue;
    const close = () => {
      if (subscriber === queue) subscriber = undefined;
      queue.close();
    };
    if (abortSignal?.aborted) {
      close();
      return queue;
    }
    abortSignal?.addEventListener('abort', close, { once: true });

    if (activeRun) {
      pumpRun(activeRun);
    } else if (chatId) {
      const requestGeneration = generation;
      void api
        .getCodexRun(chatId)
        .then((run) => {
          if (!run || requestGeneration !== generation || subscriber !== queue) return;
          activeRun = run;
          pumpRun(run);
        })
        .catch(() => undefined);
    }
    return queue;
  };

  const send = async (
    _messages: UIMessage[] | ModelMessage[],
    _data?: Record<string, unknown>,
    abortSignal?: AbortSignal,
    _runContext?: RunAgentInputContext,
  ): Promise<void> => {
    const submission = pendingSubmission;
    pendingSubmission = undefined;
    if (!submission) throw new Error('No Codex submission was prepared for this request.');

    const config = getConfig();
    const activeChatId = config.chatId ?? chatId;
    if (!activeChatId) throw new Error('No chat identity is available for this request.');
    chatId = activeChatId;
    const run = await api.startCodexText(
      activeChatId,
      submission.assistantMessageId,
      submission.text,
      submission.attachments,
      config.workingDirectory,
      codexThreadId,
      config.settings,
      config.permissionMode,
    );
    codexThreadId = run.threadId;
    activeRun = run;
    if (!abortSignal?.aborted) pumpRun(run);
  };

  return {
    get threadId() {
      return codexThreadId;
    },
    discardSubmission: (id) => {
      if (pendingSubmission?.id === id) pendingSubmission = undefined;
    },
    interruptActive: () => {
      const run = activeRun;
      if (!run) return;
      generation += 1;
      subscriber?.clear();
      activeRun = undefined;
      void api.interruptCodexTurn(run.threadId, run.turnId).catch(() => undefined);
    },
    prepareSubmission: (submission) => {
      pendingSubmission = submission;
    },
    resetThread: () => {
      generation += 1;
      subscriber?.clear();
      activeRun = undefined;
      chatId = undefined;
      codexThreadId = undefined;
      pendingSubmission = undefined;
    },
    restoreChat: (restoredChatId, threadId, run) => {
      generation += 1;
      subscriber?.clear();
      chatId = restoredChatId;
      codexThreadId = threadId;
      activeRun = run;
      pendingSubmission = undefined;
      if (run) pumpRun(run);
    },
    send,
    subscribe,
  };
};

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The Codex request failed.');
