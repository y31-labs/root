import { EventType } from '@tanstack/ai/client';
import type { StreamChunk } from '@tanstack/ai/client';

import type {
  ChatStreamEvent,
  CodexActivityCustomEventPayload,
  CodexActivityDeltaCustomEventPayload,
  CodexApprovalCustomEventPayload,
  CodexReasoningDeltaCustomEventPayload,
} from '#/lib/types';

export const CODEX_ACTIVITY_EVENT = 'codex.activity';
export const CODEX_ACTIVITY_DELTA_EVENT = 'codex.activity-delta';
export const CODEX_APPROVAL_EVENT = 'codex.approval';
export const CODEX_REASONING_DELTA_EVENT = 'codex.reasoning-delta';

const TEXT_PART_PREFIX = 'codex-text:';

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
        chunks.push({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' });
      }
      chunks.push({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: event.text });
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

const assertNever = (_value: never): never => {
  throw new Error('Unsupported Codex stream event.');
};
