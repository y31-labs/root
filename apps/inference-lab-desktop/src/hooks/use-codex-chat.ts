import { useChat as useTanStackChat } from '@tanstack/ai-react';
import type { StreamChunk, UIMessage } from '@tanstack/ai/client';
import type { PromptInputMessage } from '@workspace/ui/components/ai-elements/prompt-input';
import { useEffect, useMemo, useRef, useState } from 'react';

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
import { useLocalApi } from '#/providers/local-api-provider';

const ACTIVITY_DETAIL_LIMIT = 50_000;

interface UseCodexChatOptions {
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
type ReasoningTranscriptPart = Extract<ChatTranscriptPart, { type: 'reasoning' }>;
type SupplementalTranscriptPart =
  | ActivityTranscriptPart
  | MessageReferencePart
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
  permissionMode,
  settings,
  workingDirectory,
}: UseCodexChatOptions) => {
  const api = useLocalApi();
  const config = useRef({ permissionMode, settings, workingDirectory });
  config.current = { permissionMode, settings, workingDirectory };

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
  const activeAssistantMessageId = useRef<string | undefined>(undefined);
  const nextMessageId = useRef(0);
  const submissionInFlight = useRef(false);

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

    if (chunk.type === 'RUN_FINISHED') finishActiveTurn();
  };

  const chat = useTanStackChat({
    id: 'inference-lab-codex-chat',
    connection,
    queue: 'drop',
    onChunk: handleChunk,
    onError: recordError,
  });

  const previousWorkingDirectory = useRef(workingDirectory);
  useEffect(() => {
    if (previousWorkingDirectory.current === workingDirectory) return;
    previousWorkingDirectory.current = workingDirectory;
    chat.stop();
    connection.resetThread();
    chat.clear();
    setTurns([]);
    activeAssistantMessageId.current = undefined;
    submissionInFlight.current = false;
  }, [chat.clear, chat.stop, connection, workingDirectory]);

  const messages = useMemo(
    () => buildChatMessages(turns, chat.messages, activeAssistantMessageId.current),
    [chat.messages, turns],
  );

  const submitPrompt = ({ files, text: submittedText }: PromptInputMessage) => {
    const text = submittedText.trim();
    if ((!text && files.length === 0) || chat.isLoading || submissionInFlight.current) return;

    submissionInFlight.current = true;
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
      });
  };

  const stopResponse = () => {
    chat.stop();
    submissionInFlight.current = false;
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
    messages,
    pending: chat.isLoading,
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
  if (parts?.some((part) => part.type === 'message' && part.messageId === messageId)) {
    return parts;
  }
  return [...(parts ?? []), { type: 'message', id, messageId }];
};

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
