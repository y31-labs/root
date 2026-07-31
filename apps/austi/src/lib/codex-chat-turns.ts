import type { UIMessage } from '@tanstack/ai/client';

import type { ChatRecord } from '#/lib/chat-history';
import type { ChatApproval, ChatMessage, FileAttachment } from '#/lib/chat-message';
import {
  materializeTranscript,
  messageText,
  type SupplementalTranscriptPart,
} from '#/lib/codex-chat-transcript';
import type { CodexRunInfo } from '#/lib/types';

export interface CodexTurn {
  approvals?: ChatApproval[];
  assistantMessageId: string;
  attachments: FileAttachment[];
  completedAtMs?: number;
  parts?: SupplementalTranscriptPart[];
  startedAtMs: number;
  submittedText: string;
  userMessageId: string;
}

export const buildChatMessages = (
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

export const hydrateTurns = (
  messages: ChatMessage[],
  fallbackCompletedAtMs: number,
  activeAssistantMessageId?: string,
): CodexTurn[] => {
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
      ...(assistantMessageId === activeAssistantMessageId
        ? {}
        : { completedAtMs: assistantMessage.completedAtMs ?? fallbackCompletedAtMs }),
      ...(parts ? { parts } : {}),
      startedAtMs: assistantMessage.startedAtMs ?? fallbackCompletedAtMs,
      submittedText: userMessage.text,
      userMessageId: String(userMessage.id),
    });
    index += 1;
  }

  return turns;
};

export const runForIncompleteTurn = (chat: ChatRecord, run: CodexRunInfo | undefined) => {
  if (!run) return undefined;
  const assistantMessage = chat.messages.find(
    (message) => message.role === 'assistant' && String(message.id) === run.assistantMessageId,
  );
  if (
    !assistantMessage ||
    (assistantMessage.completedAtMs !== undefined && !assistantMessage.streaming)
  ) {
    return undefined;
  }
  return run;
};

export const resetRunningTurn = (
  messages: ChatMessage[],
  assistantMessageId: string,
): { changed: boolean; messages: ChatMessage[] } => ({
  changed: false,
  messages: messages.map((message) => {
    if (message.role !== 'assistant' || String(message.id) !== assistantMessageId) return message;
    const {
      approvals: _approvals,
      completedAtMs: _completedAtMs,
      error: _error,
      parts: _parts,
      ...runningMessage
    } = message;
    return { ...runningMessage, streaming: true, text: '' };
  }),
});

export const greatestMessageNumber = (messages: ChatMessage[]) =>
  messages.reduce((greatest, message) => {
    const match = /^message-(\d+)$/.exec(String(message.id));
    return match ? Math.max(greatest, Number(match[1])) : greatest;
  }, 0);

export const updateTurn = (
  turns: CodexTurn[],
  assistantMessageId: string,
  update: (turn: CodexTurn) => CodexTurn,
) => turns.map((turn) => (turn.assistantMessageId === assistantMessageId ? update(turn) : turn));

export const updateTurnApproval = (
  turns: CodexTurn[],
  requestId: string | number,
  update: Partial<ChatApproval>,
) =>
  turns.map((turn) => ({
    ...turn,
    approvals: turn.approvals?.map((approval) =>
      approval.requestId === requestId ? { ...approval, ...update } : approval,
    ),
  }));

export const finishTurn = (turn: CodexTurn): CodexTurn => ({
  ...turn,
  completedAtMs: turn.completedAtMs ?? Date.now(),
});
