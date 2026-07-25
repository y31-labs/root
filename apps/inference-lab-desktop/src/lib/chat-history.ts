import type { ChatMessage } from '#/lib/chat-message';

export interface ChatSummary {
  id: string;
  title: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ChatHistoryStatus {
  warning?: string;
}

export interface ChatSaveResult extends ChatSummary {
  attachmentStorageKeys: Record<string, string>;
}

export interface ChatRecord extends ChatSummary {
  archivedAtMs?: number;
  codexThreadId?: string;
  messages: ChatMessage[];
  workingDirectory?: string;
}

export const createChatTitle = (text: string, filenames: string[]) => {
  const source = text.trim() || filenames[0] || 'Attachment';
  const compact = source.replaceAll(/\s+/g, ' ');
  return compact.length > 56 ? `${compact.slice(0, 55).trimEnd()}…` : compact;
};

export const createChatId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const normalizeStoredMessages = (
  messages: ChatMessage[],
  fallbackCompletedAtMs: number,
): { changed: boolean; messages: ChatMessage[] } => {
  let changed = false;
  const normalizedMessages = messages.map((message) => {
    if (message.role !== 'assistant') return message;
    let nextMessage = message;

    if (message.streaming === true || message.completedAtMs === undefined) {
      const { streaming: _streaming, ...withoutStreaming } = nextMessage;
      nextMessage = {
        ...withoutStreaming,
        completedAtMs: message.completedAtMs ?? fallbackCompletedAtMs,
      };
      changed = true;
    }

    if (
      message.approvals?.some(
        (approval) => approval.status === 'pending' || approval.status === 'submitting',
      )
    ) {
      nextMessage = {
        ...nextMessage,
        approvals: message.approvals.map((approval) =>
          approval.status === 'pending' || approval.status === 'submitting'
            ? { ...approval, error: undefined, status: 'expired' as const }
            : approval,
        ),
      };
      changed = true;
    }

    if (
      message.parts?.some(
        (part) =>
          part.type === 'activity' &&
          part.activities.some((activity) => activity.status === 'running'),
      )
    ) {
      nextMessage = {
        ...nextMessage,
        parts: message.parts.map((part) =>
          part.type === 'activity'
            ? {
                ...part,
                activities: part.activities.map((activity) =>
                  activity.status === 'running'
                    ? { ...activity, status: 'failed' as const }
                    : activity,
                ),
              }
            : part,
        ),
      };
      changed = true;
    }

    return nextMessage;
  });
  return { changed, messages: normalizedMessages };
};

export const collectAttachmentStorageKeys = (messages: ChatMessage[]) =>
  Object.fromEntries(
    messages.flatMap((message) =>
      (message.attachments ?? []).flatMap((attachment) =>
        attachment.storageKey ? [[attachment.id, attachment.storageKey] as const] : [],
      ),
    ),
  );

export const applyAttachmentStorageKeys = (
  messages: ChatMessage[],
  storageKeys: Record<string, string>,
): ChatMessage[] =>
  messages.map((message) =>
    message.attachments?.length
      ? {
          ...message,
          attachments: message.attachments.map((attachment) => {
            const storageKey = storageKeys[attachment.id];
            if (storageKey) return { ...attachment, storageKey };
            if (!attachment.storageKey) return attachment;
            const { storageKey: _storageKey, ...unstoredAttachment } = attachment;
            return unstoredAttachment;
          }),
        }
      : message,
  );

export const withoutStoredAttachmentUrls = (chat: ChatRecord): ChatRecord => ({
  ...chat,
  messages: chat.messages.map((message) =>
    message.attachments?.some((attachment) => attachment.storageKey)
      ? {
          ...message,
          attachments: message.attachments.map((attachment) => {
            if (!attachment.storageKey) return attachment;
            const { url: _url, ...storedAttachment } = attachment;
            return storedAttachment;
          }),
        }
      : message,
  ),
});
