import { useChat as useTanStackChat } from '@tanstack/ai-react';
import type { StreamChunk, UIMessage } from '@tanstack/ai/client';
import type { PromptInputMessage } from '@workspace/ui/components/ai-elements/prompt-input';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  applyAttachmentStorageKeys,
  collectAttachmentStorageKeys,
  createChatId,
  createChatTitle,
  normalizeStoredMessages,
  withoutStoredAttachmentUrls,
  type ChatRecord,
} from '#/lib/chat-history';
import type { ChatApproval, ChatMessage, FileAttachment } from '#/lib/chat-message';
import {
  CODEX_ACTIVITY_DELTA_EVENT,
  CODEX_ACTIVITY_EVENT,
  CODEX_APPROVAL_EVENT,
  CODEX_REASONING_DELTA_EVENT,
  CodexChatConnection,
  parseCodexTextPartId,
} from '#/lib/codex-chat-connection';
import type {
  ChatTranscriptPart,
  CodexActivity,
  CodexActivityCustomEventPayload,
  CodexActivityDeltaCustomEventPayload,
  CodexApprovalCustomEventPayload,
  CodexReasoningDeltaCustomEventPayload,
  CodexApprovalDecision,
  CodexApprovalMethod,
  ModelSettings,
  PermissionMode,
} from '#/lib/types';
import { useChatHistory } from '#/providers/chat-history-provider';
import { useLocalApi } from '#/providers/local-api-provider';

const ACTIVITY_DETAIL_LIMIT = 50_000;
const CHAT_SAVE_DELAY_MS = 300;

interface UseCodexChatOptions {
  onWorkingDirectoryChange?: (workingDirectory: string | undefined) => void;
  permissionMode: PermissionMode;
  workingDirectory?: string;
  settings?: ModelSettings;
}

interface MessageReferencePart {
  type: 'message';
  id: string;
  messageId: string;
}

type ActivityTranscriptPart = Extract<ChatTranscriptPart, { type: 'activity' }>;
type MessageTranscriptPart = Extract<ChatTranscriptPart, { type: 'message' }>;
type ReasoningTranscriptPart = Extract<ChatTranscriptPart, { type: 'reasoning' }>;
type SupplementalTranscriptPart =
  | ActivityTranscriptPart
  | MessageReferencePart
  | MessageTranscriptPart
  | ReasoningTranscriptPart;
interface CodexTurn {
  approvals?: ChatApproval[];
  assistantMessageId: string;
  attachments: FileAttachment[];
  completedAtMs?: number;
  parts?: SupplementalTranscriptPart[];
  startedAtMs: number;
  submittedText: string;
  userMessageId: string;
}

export const useCodexChat = ({
  onWorkingDirectoryChange,
  permissionMode,
  settings,
  workingDirectory,
}: UseCodexChatOptions) => {
  const api = useLocalApi();
  const chatHistory = useChatHistory();
  const chatHistoryRef = useRef(chatHistory);
  chatHistoryRef.current = chatHistory;
  const config = useRef({ onWorkingDirectoryChange, permissionMode, settings, workingDirectory });
  config.current = { onWorkingDirectoryChange, permissionMode, settings, workingDirectory };

  const connectionRef = useRef<CodexChatConnection | null>(null);
  if (!connectionRef.current) {
    connectionRef.current = new CodexChatConnection({
      api,
      getConfig: () => config.current,
    });
  }
  const connection = connectionRef.current;

  const [prompt, setPrompt] = useState('');
  const [turns, setTurns] = useState<CodexTurn[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const activeAssistantMessageId = useRef<string | undefined>(undefined);
  const chatMetadata = useRef<
    Pick<ChatRecord, 'createdAtMs' | 'id' | 'title' | 'workingDirectory'> | undefined
  >(undefined);
  const chatSnapshot = useRef<ChatRecord | undefined>(undefined);
  const skipHydratedSnapshot = useRef(false);
  const saveTimeout = useRef<number | undefined>(undefined);
  const nextMessageId = useRef(0);
  const attachmentStorageKeys = useRef<Record<string, string>>({});
  const pendingWorkingDirectoryRestore = useRef<{ value: string | undefined } | undefined>(
    undefined,
  );
  const submissionInFlight = useRef(false);

  const persistSnapshot = useCallback(() => {
    if (saveTimeout.current !== undefined) window.clearTimeout(saveTimeout.current);
    saveTimeout.current = undefined;
    const snapshot = chatSnapshot.current;
    if (!snapshot) return Promise.resolve();
    return chatHistoryRef.current
      .persistChat(withoutStoredAttachmentUrls(snapshot))
      .then((result) => {
        if (!result) return;
        const currentSnapshot = chatSnapshot.current;
        if (currentSnapshot?.id !== snapshot.id) return;
        attachmentStorageKeys.current = result.attachmentStorageKeys;
        chatSnapshot.current = {
          ...currentSnapshot,
          messages: applyAttachmentStorageKeys(
            currentSnapshot.messages,
            attachmentStorageKeys.current,
          ),
        };
      })
      .catch(console.error);
  }, []);

  const finishActiveTurn = () => {
    const assistantMessageId = activeAssistantMessageId.current;
    if (!assistantMessageId) return;
    setTurns((current) =>
      current.map((turn) =>
        turn.assistantMessageId === assistantMessageId ? finishTurn(turn) : turn,
      ),
    );
    activeAssistantMessageId.current = undefined;
  };

  const recordError = (error: Error) => {
    const detail = errorMessage(error);
    const activeId = activeAssistantMessageId.current;
    setTurns((current) => {
      const assistantMessageId =
        activeId ??
        [...current].reverse().find((turn) => turn.completedAtMs === undefined)?.assistantMessageId;
      if (!assistantMessageId) return current;
      return current.map((turn) => {
        if (turn.assistantMessageId !== assistantMessageId) return turn;
        return {
          ...finishTurn(turn),
          parts: transcriptHasFailedError(turn.parts)
            ? turn.parts
            : mergeActivityPart(turn.parts, {
                id: `request-${assistantMessageId}-error`,
                kind: 'error',
                label: detail,
                status: 'failed',
              }),
        };
      });
    });
    const chatId = chatMetadata.current?.id;
    if (chatId) chatHistoryRef.current.setChatRunning(chatId, false);
    activeAssistantMessageId.current = undefined;
  };

  const handleChunk = (chunk: StreamChunk) => {
    if (chunk.type === 'TEXT_MESSAGE_START') {
      const identity = parseCodexTextPartId(chunk.messageId);
      if (!identity) return;
      setTurns((current) =>
        updateTurn(current, identity.assistantMessageId, (turn) => ({
          ...turn,
          parts: appendMessageReference(turn.parts, identity.id, chunk.messageId),
        })),
      );
      return;
    }

    if (chunk.type === 'CUSTOM' && chunk.name === CODEX_REASONING_DELTA_EVENT) {
      const { assistantMessageId, delta, id, summaryIndex } =
        chunk.value as CodexReasoningDeltaCustomEventPayload;
      setTurns((current) =>
        updateTurn(current, assistantMessageId, (turn) => ({
          ...turn,
          parts: appendReasoningDelta(turn.parts, id, summaryIndex, delta),
        })),
      );
      return;
    }

    if (chunk.type === 'CUSTOM' && chunk.name === CODEX_ACTIVITY_EVENT) {
      const { activity, assistantMessageId } = chunk.value as CodexActivityCustomEventPayload;
      setTurns((current) =>
        updateTurn(current, assistantMessageId, (turn) => ({
          ...turn,
          parts: mergeActivityPart(turn.parts, activity),
        })),
      );
      return;
    }

    if (chunk.type === 'CUSTOM' && chunk.name === CODEX_ACTIVITY_DELTA_EVENT) {
      const { assistantMessageId, delta, id } = chunk.value as CodexActivityDeltaCustomEventPayload;
      setTurns((current) =>
        updateTurn(current, assistantMessageId, (turn) => ({
          ...turn,
          parts: appendActivityDetail(turn.parts, id, delta),
        })),
      );
      return;
    }

    if (chunk.type === 'CUSTOM' && chunk.name === CODEX_APPROVAL_EVENT) {
      const { approval, assistantMessageId } = chunk.value as CodexApprovalCustomEventPayload;
      setTurns((current) =>
        updateTurn(current, assistantMessageId, (turn) => ({
          ...turn,
          approvals: turn.approvals?.some((candidate) => candidate.requestId === approval.requestId)
            ? turn.approvals
            : [...(turn.approvals ?? []), { ...approval, status: 'pending' }],
        })),
      );
      return;
    }

    if (chunk.type === 'RUN_FINISHED') {
      const chatId = chatMetadata.current?.id;
      if (chatId) chatHistoryRef.current.setChatRunning(chatId, false);
      finishActiveTurn();
    }
  };

  const chat = useTanStackChat({
    id: 'inference-lab-codex-chat',
    connection,
    queue: 'drop',
    onChunk: handleChunk,
    onError: recordError,
  });

  useEffect(() => {
    const archivedChatId = chatHistoryRef.current.archivedChatId;
    const archiveSnapshot = chatSnapshot.current?.id === archivedChatId;
    if (archiveSnapshot && saveTimeout.current !== undefined) {
      window.clearTimeout(saveTimeout.current);
      saveTimeout.current = undefined;
    }
    const pendingSave = archiveSnapshot ? Promise.resolve() : persistSnapshot();
    const previousChatId = chatMetadata.current?.id;
    if (previousChatId) chatHistoryRef.current.setChatRunning(previousChatId, false);
    chatSnapshot.current = undefined;
    chatMetadata.current = undefined;
    attachmentStorageKeys.current = {};
    skipHydratedSnapshot.current = false;
    chat.stop();
    connection.resetThread();
    chat.clear();
    setTurns([]);
    setPrompt('');
    activeAssistantMessageId.current = undefined;
    submissionInFlight.current = false;

    const { activeChatId, loadChat } = chatHistoryRef.current;
    if (!activeChatId) {
      setLoadingHistory(false);
      return;
    }

    let active = true;
    setLoadingHistory(true);
    void pendingSave
      .then(() => loadChat(activeChatId))
      .then((storedChat) => {
        if (!active || !storedChat) return;
        const normalized = normalizeStoredMessages(storedChat.messages, storedChat.updatedAtMs);
        const currentWorkingDirectory = config.current.workingDirectory;
        const savedWorkingDirectory = storedChat.workingDirectory;
        const canApplySavedWorkingDirectory =
          savedWorkingDirectory !== undefined &&
          savedWorkingDirectory !== currentWorkingDirectory &&
          config.current.onWorkingDirectoryChange !== undefined;
        if (canApplySavedWorkingDirectory) {
          pendingWorkingDirectoryRestore.current = { value: savedWorkingDirectory };
          config.current.onWorkingDirectoryChange?.(savedWorkingDirectory);
        }
        const canRestoreThread =
          savedWorkingDirectory === currentWorkingDirectory || canApplySavedWorkingDirectory;
        const effectiveWorkingDirectory = canRestoreThread
          ? savedWorkingDirectory
          : currentWorkingDirectory;
        const normalizedChat = {
          ...storedChat,
          messages: normalized.messages,
          ...(effectiveWorkingDirectory
            ? { workingDirectory: effectiveWorkingDirectory }
            : { workingDirectory: undefined }),
        };
        const hydratedTurns = hydrateTurns(normalizedChat.messages, normalizedChat.updatedAtMs);
        chatMetadata.current = {
          id: normalizedChat.id,
          title: normalizedChat.title,
          createdAtMs: normalizedChat.createdAtMs,
          workingDirectory: normalizedChat.workingDirectory,
        };
        chatSnapshot.current = normalizedChat;
        attachmentStorageKeys.current = collectAttachmentStorageKeys(normalizedChat.messages);
        skipHydratedSnapshot.current = normalizedChat.messages.length > 0;
        connection.restoreThread(canRestoreThread ? normalizedChat.codexThreadId : undefined);
        nextMessageId.current = greatestMessageNumber(normalizedChat.messages);
        setTurns(hydratedTurns);
        if (normalized.changed) {
          void persistSnapshot();
        }
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoadingHistory(false);
      });

    return () => {
      active = false;
    };
  }, [chat.clear, chat.stop, connection, persistSnapshot, chatHistory.sessionVersion]);

  const previousWorkingDirectory = useRef(workingDirectory);
  useEffect(() => {
    if (previousWorkingDirectory.current === workingDirectory) return;
    previousWorkingDirectory.current = workingDirectory;
    const pendingRestore = pendingWorkingDirectoryRestore.current;
    if (pendingRestore && pendingRestore.value === workingDirectory) {
      pendingWorkingDirectoryRestore.current = undefined;
      return;
    }
    pendingWorkingDirectoryRestore.current = undefined;
    void persistSnapshot();
    const previousChatId = chatMetadata.current?.id;
    if (previousChatId) chatHistoryRef.current.setChatRunning(previousChatId, false);
    chatSnapshot.current = undefined;
    chatMetadata.current = undefined;
    attachmentStorageKeys.current = {};
    skipHydratedSnapshot.current = false;
    chat.stop();
    connection.resetThread();
    chat.clear();
    setTurns([]);
    activeAssistantMessageId.current = undefined;
    submissionInFlight.current = false;
    chatHistoryRef.current.newChat();
  }, [chat.clear, chat.stop, connection, persistSnapshot, workingDirectory]);

  const messages = useMemo(
    () => buildChatMessages(turns, chat.messages, activeAssistantMessageId.current),
    [chat.messages, turns],
  );

  useEffect(() => {
    const metadata = chatMetadata.current;
    if (!metadata || messages.length === 0 || loadingHistory) return;
    if (skipHydratedSnapshot.current) {
      skipHydratedSnapshot.current = false;
      return;
    }

    const previousUpdatedAtMs = chatSnapshot.current?.updatedAtMs ?? metadata.createdAtMs;
    chatSnapshot.current = {
      ...metadata,
      ...(connection.threadId ? { codexThreadId: connection.threadId } : {}),
      messages: applyAttachmentStorageKeys(messages, attachmentStorageKeys.current),
      updatedAtMs: Math.max(Date.now(), previousUpdatedAtMs + 1),
    };
    if (saveTimeout.current !== undefined) window.clearTimeout(saveTimeout.current);
    saveTimeout.current = window.setTimeout(() => void persistSnapshot(), CHAT_SAVE_DELAY_MS);
    return () => {
      if (saveTimeout.current !== undefined) window.clearTimeout(saveTimeout.current);
    };
  }, [chat.isLoading, connection, loadingHistory, messages, persistSnapshot]);

  useEffect(
    () => () => {
      void persistSnapshot();
    },
    [persistSnapshot],
  );

  const submitPrompt = ({ files, text: submittedText }: PromptInputMessage) => {
    const text = submittedText.trim();
    if (
      (!text && files.length === 0) ||
      chat.isLoading ||
      loadingHistory ||
      submissionInFlight.current
    ) {
      return;
    }

    if (!chatMetadata.current) {
      const now = Date.now();
      const id = createChatId();
      chatMetadata.current = {
        id,
        title: createChatTitle(
          text,
          files.map((file) => file.filename ?? ''),
        ),
        createdAtMs: now,
        workingDirectory,
      };
      chatHistoryRef.current.activateChat(id);
      void chatHistoryRef.current
        .generateChatTitle({
          chatId: id,
          filenames: files.map((file) => file.filename ?? ''),
          firstPrompt: text,
          settings,
        })
        .then((title) => {
          if (!title || chatMetadata.current?.id !== id) return;
          chatMetadata.current = { ...chatMetadata.current, title };
          if (chatSnapshot.current?.id === id) {
            chatSnapshot.current = { ...chatSnapshot.current, title };
            void persistSnapshot();
          }
        });
    }

    const submittedChatId = chatMetadata.current.id;
    submissionInFlight.current = true;
    chatHistoryRef.current.setChatRunning(submittedChatId, true);
    const userMessageId = `message-${++nextMessageId.current}`;
    const assistantMessageId = `message-${++nextMessageId.current}`;
    const attachments = files.map((file, index) => ({
      ...file,
      id: `${userMessageId}-file-${index}`,
    }));
    const turn: CodexTurn = {
      assistantMessageId,
      attachments,
      startedAtMs: Date.now(),
      submittedText: text,
      userMessageId,
    };
    activeAssistantMessageId.current = assistantMessageId;
    setTurns((current) => [...current, turn]);
    setPrompt('');
    connection.prepareSubmission({
      assistantMessageId,
      attachments: files.map((file) => ({
        dataUrl: file.url,
        filename: file.filename ?? 'attachment',
        mediaType: file.mediaType || 'application/octet-stream',
      })),
      id: userMessageId,
      text,
    });

    void chat
      .sendMessage({ content: text, id: userMessageId }, { whenBusy: 'drop' })
      .catch(recordError)
      .finally(() => {
        connection.discardSubmission(userMessageId);
        submissionInFlight.current = false;
        chatHistoryRef.current.setChatRunning(submittedChatId, false);
      });
  };

  const stopResponse = () => {
    chat.stop();
    submissionInFlight.current = false;
    const chatId = chatMetadata.current?.id;
    if (chatId) chatHistoryRef.current.setChatRunning(chatId, false);
    finishActiveTurn();
  };

  const resolveApproval = (
    requestId: string | number,
    method: CodexApprovalMethod,
    decision: CodexApprovalDecision,
  ) => {
    updateApproval(setTurns, requestId, { error: undefined, status: 'submitting' });
    void api
      .resolveCodexApproval(requestId, method, decision)
      .then(() => updateApproval(setTurns, requestId, { decision, status: 'resolved' }))
      .catch((error: unknown) =>
        updateApproval(setTurns, requestId, { error: errorMessage(error), status: 'pending' }),
      );
  };

  return {
    loadingHistory,
    messages,
    pending: chat.isLoading || loadingHistory,
    prompt,
    resolveApproval,
    setPrompt,
    stopResponse,
    submitPrompt,
  };
};

const buildChatMessages = (
  turns: CodexTurn[],
  tanstackMessages: UIMessage[],
  activeAssistantMessageId: string | undefined,
): ChatMessage[] => {
  const messagesById = new Map(tanstackMessages.map((message) => [message.id, message]));
  return turns.flatMap((turn) => {
    const userMessage = messagesById.get(turn.userMessageId);
    const transcript = materializeTranscript(turn.parts, messagesById);
    return [
      {
        attachments: turn.attachments,
        id: turn.userMessageId,
        role: 'user' as const,
        text: userMessage ? messageText(userMessage) : turn.submittedText,
      },
      {
        ...(turn.approvals !== undefined ? { approvals: turn.approvals } : {}),
        ...(turn.completedAtMs !== undefined ? { completedAtMs: turn.completedAtMs } : {}),
        id: turn.assistantMessageId,
        ...(transcript.length > 0 ? { parts: transcript } : {}),
        role: 'assistant' as const,
        startedAtMs: turn.startedAtMs,
        streaming:
          turn.completedAtMs === undefined && activeAssistantMessageId === turn.assistantMessageId,
        text: '',
      },
    ];
  });
};

const materializeTranscript = (
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

const messageText = (message: UIMessage | undefined) =>
  message?.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.content)
    .join('') ?? '';

const appendMessageReference = (
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

const hydrateTurns = (messages: ChatMessage[], fallbackCompletedAtMs: number): CodexTurn[] => {
  const turns: CodexTurn[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const userMessage = messages[index];
    if (userMessage?.role !== 'user') continue;
    const assistantMessage = messages[index + 1];
    if (assistantMessage?.role !== 'assistant') continue;
    const assistantMessageId = String(assistantMessage.id);
    const parts =
      assistantMessage.parts ??
      (assistantMessage.text
        ? [
            {
              type: 'message' as const,
              id: `${assistantMessageId}-text`,
              text: assistantMessage.text,
            },
          ]
        : undefined);
    turns.push({
      ...(assistantMessage.approvals ? { approvals: assistantMessage.approvals } : {}),
      assistantMessageId,
      attachments: userMessage.attachments ?? [],
      completedAtMs: assistantMessage.completedAtMs ?? fallbackCompletedAtMs,
      ...(parts ? { parts } : {}),
      startedAtMs: assistantMessage.startedAtMs ?? fallbackCompletedAtMs,
      submittedText: userMessage.text,
      userMessageId: String(userMessage.id),
    });
    index += 1;
  }

  return turns;
};

const greatestMessageNumber = (messages: ChatMessage[]) =>
  messages.reduce((greatest, message) => {
    const match = /^message-(\d+)$/.exec(String(message.id));
    return match ? Math.max(greatest, Number(match[1])) : greatest;
  }, 0);

const appendReasoningDelta = (
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

const mergeActivityPart = (
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

const appendActivityDetail = (
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

const updateTurn = (
  turns: CodexTurn[],
  assistantMessageId: string,
  update: (turn: CodexTurn) => CodexTurn,
) => turns.map((turn) => (turn.assistantMessageId === assistantMessageId ? update(turn) : turn));

const updateApproval = (
  setTurns: React.Dispatch<React.SetStateAction<CodexTurn[]>>,
  requestId: string | number,
  update: Partial<ChatApproval>,
) => {
  setTurns((current) =>
    current.map((turn) => ({
      ...turn,
      approvals: turn.approvals?.map((approval) =>
        approval.requestId === requestId ? { ...approval, ...update } : approval,
      ),
    })),
  );
};

const finishTurn = (turn: CodexTurn): CodexTurn => ({
  ...turn,
  completedAtMs: turn.completedAtMs ?? Date.now(),
});

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';

const transcriptHasFailedError = (parts: SupplementalTranscriptPart[] | undefined) =>
  parts?.some(
    (part) =>
      part.type === 'activity' &&
      part.activities.some((activity) => activity.kind === 'error' && activity.status === 'failed'),
  ) === true;

const appendBoundedDetail = (current: string | undefined, delta: string) => {
  const detail = `${current ?? ''}${delta}`;
  return detail.length > ACTIVITY_DETAIL_LIMIT
    ? `…${detail.slice(-(ACTIVITY_DETAIL_LIMIT - 1))}`
    : detail;
};
