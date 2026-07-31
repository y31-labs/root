import type { UIMessage } from '@tanstack/ai/client';

import type { ChatTranscriptPart, CodexActivity } from '#/lib/types';

const ACTIVITY_DETAIL_LIMIT = 50_000;

interface MessageReferencePart {
  type: 'message';
  id: string;
  messageId: string;
}

type ActivityTranscriptPart = Extract<ChatTranscriptPart, { type: 'activity' }>;
type MessageTranscriptPart = Extract<ChatTranscriptPart, { type: 'message' }>;
type ReasoningTranscriptPart = Extract<ChatTranscriptPart, { type: 'reasoning' }>;

export type SupplementalTranscriptPart =
  | ActivityTranscriptPart
  | MessageReferencePart
  | MessageTranscriptPart
  | ReasoningTranscriptPart;

export const materializeTranscript = (
  parts: SupplementalTranscriptPart[] | undefined,
  messagesById: Map<string, UIMessage>,
): ChatTranscriptPart[] =>
  (parts ?? []).map((part) => {
    if (part.type === 'activity') return part;
    if (part.type === 'message') {
      if (!('messageId' in part)) return part;
      return {
        type: 'message',
        id: part.id,
        text: messageText(messagesById.get(part.messageId)),
      };
    }

    return part;
  });

export const messageText = (message: UIMessage | undefined) =>
  message?.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.content)
    .join('') ?? '';

export const appendMessageReference = (
  parts: SupplementalTranscriptPart[] | undefined,
  id: string,
  messageId: string,
): SupplementalTranscriptPart[] => {
  if (
    parts?.some(
      (part) => part.type === 'message' && 'messageId' in part && part.messageId === messageId,
    )
  ) {
    return parts;
  }
  return [...(parts ?? []), { type: 'message', id, messageId }];
};

export const appendReasoningDelta = (
  parts: SupplementalTranscriptPart[] | undefined,
  id: string,
  summaryIndex: number,
  delta: string,
): SupplementalTranscriptPart[] => {
  const next = [...(parts ?? [])];
  const index = next.findIndex((part) => part.type === 'reasoning' && part.id === id);
  if (index === -1) {
    const summaries: string[] = [];
    summaries[summaryIndex] = delta;
    return [...next, { type: 'reasoning', id, summaries }];
  }
  const current = next[index];
  if (current?.type !== 'reasoning') return next;
  const summaries = [...current.summaries];
  summaries[summaryIndex] = `${summaries[summaryIndex] ?? ''}${delta}`;
  next[index] = { ...current, summaries };
  return next;
};

export const mergeActivityPart = (
  parts: SupplementalTranscriptPart[] | undefined,
  incoming: CodexActivity,
): SupplementalTranscriptPart[] => {
  const next = [...(parts ?? [])];
  const partIndex = next.findIndex(
    (part) =>
      part.type === 'activity' && part.activities.some((activity) => activity.id === incoming.id),
  );
  if (partIndex !== -1) {
    const current = next[partIndex];
    if (current?.type !== 'activity') return next;
    next[partIndex] = { ...current, activities: mergeActivity(current.activities, incoming) };
    return next;
  }

  const last = next.at(-1);
  if (last?.type === 'activity') {
    next[next.length - 1] = { ...last, activities: [...last.activities, incoming] };
    return next;
  }
  return [...next, { type: 'activity', id: `activity-${incoming.id}`, activities: [incoming] }];
};

export const appendActivityDetail = (
  parts: SupplementalTranscriptPart[] | undefined,
  id: string,
  delta: string,
): SupplementalTranscriptPart[] => {
  const next = [...(parts ?? [])];
  const partIndex = next.findIndex(
    (part) => part.type === 'activity' && part.activities.some((activity) => activity.id === id),
  );
  if (partIndex === -1) {
    return mergeActivityPart(next, {
      id,
      kind: 'tool',
      label: 'Working',
      detail: delta,
      status: 'running',
    });
  }
  const part = next[partIndex];
  if (part?.type !== 'activity') return next;
  const activities = [...part.activities];
  const activityIndex = activities.findIndex((activity) => activity.id === id);
  const current = activities[activityIndex];
  if (!current) return next;
  activities[activityIndex] = {
    ...current,
    detail: appendBoundedDetail(current.detail, delta),
  };
  next[partIndex] = { ...part, activities };
  return next;
};

export const transcriptHasFailedError = (parts: SupplementalTranscriptPart[] | undefined) =>
  parts?.some(
    (part) =>
      part.type === 'activity' &&
      part.activities.some((activity) => activity.kind === 'error' && activity.status === 'failed'),
  ) === true;

const mergeActivity = (activities: CodexActivity[], incoming: CodexActivity): CodexActivity[] => {
  const next = [...activities];
  const index = next.findIndex((activity) => activity.id === incoming.id);
  if (index === -1) return [...next, incoming];
  const current = next[index];
  if (!current) return next;
  next[index] = {
    ...current,
    ...incoming,
    detail: incoming.detail ?? current.detail,
    items: incoming.items ?? current.items,
  };
  return next;
};

const appendBoundedDetail = (current: string | undefined, delta: string) => {
  const detail = `${current ?? ''}${delta}`;
  return detail.length > ACTIVITY_DETAIL_LIMIT
    ? `…${detail.slice(-(ACTIVITY_DETAIL_LIMIT - 1))}`
    : detail;
};
