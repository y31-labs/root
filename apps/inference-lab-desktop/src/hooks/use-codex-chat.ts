import { useChat as useTanStackChat } from '@tanstack/ai-react';
import type { PromptInputMessage } from '@workspace/ui/components/ai-elements/prompt-input';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCodexChatSession, type CodexChatMetadata } from '#/hooks/use-codex-chat-session';
import { useCodexTurns } from '#/hooks/use-codex-turns';
import { useLatest } from '#/hooks/use-latest';
import {
  applyAttachmentStorageKeys,
  createChatId,
  createChatTitle,
  withoutStoredAttachmentUrls,
  type ChatRecord,
} from '#/lib/chat-history';
import { createCodexChatConnection, type CodexChatConnection } from '#/lib/codex-chat-connection';
import { buildChatMessages, type CodexTurn } from '#/lib/codex-chat-turns';
import type { ModelSettings, PermissionMode } from '#/lib/types';
import { useChatHistory } from '#/providers/chat-history-provider';
import { useGeneratedApps } from '#/providers/generated-apps-provider';
import { useLocalApi } from '#/providers/local-api-provider';

const CHAT_SAVE_DELAY_MS = 300;

interface UseCodexChatOptions {
  onWorkingDirectoryChange?: (workingDirectory: string | undefined) => void;
  permissionMode: PermissionMode;
  workingDirectory?: string;
  settings?: ModelSettings;
}

export const useCodexChat = ({
  onWorkingDirectoryChange,
  permissionMode,
  settings,
  workingDirectory,
}: UseCodexChatOptions) => {
  const api = useLocalApi();
  const generatedApps = useGeneratedApps();
  const chatHistory = useChatHistory();
  const chatHistoryRef = useLatest(chatHistory);
  const config = useLatest({
    onWorkingDirectoryChange,
    permissionMode,
    settings,
    workingDirectory,
  });
  const chatMetadata = useRef<CodexChatMetadata | undefined>(undefined);

  const connectionRef = useRef<CodexChatConnection | null>(null);
  if (!connectionRef.current) {
    connectionRef.current = createCodexChatConnection({
      api,
      getConfig: () => ({ ...config.current, chatId: chatMetadata.current?.id }),
    });
  }
  const connection = connectionRef.current;

  const [prompt, setPrompt] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const chatSnapshot = useRef<ChatRecord | undefined>(undefined);
  const skipHydratedSnapshot = useRef(false);
  const saveTimeout = useRef<number | undefined>(undefined);
  const nextMessageId = useRef(0);
  const attachmentStorageKeys = useRef<Record<string, string>>({});
  const pendingWorkingDirectoryRestore = useRef<{ value: string | undefined } | undefined>(
    undefined,
  );
  const submissionInFlight = useRef(false);
  const {
    activeAssistantMessageId,
    finishActiveTurn,
    handleChunk,
    recordError,
    resolveApproval,
    setTurns,
    turns,
  } = useCodexTurns(api, () => {
    const chatId = chatMetadata.current?.id;
    if (chatId) chatHistoryRef.current.setChatRunning(chatId, false);
  });

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

  const chat = useTanStackChat({
    id: 'inference-lab-codex-chat',
    connection,
    live: true,
    queue: 'drop',
    onChunk: handleChunk,
    onError: recordError,
  });

  useCodexChatSession({
    activeAssistantMessageId,
    api,
    attachmentStorageKeys,
    clearChat: chat.clear,
    chatHistoryRef,
    chatMetadata,
    chatSnapshot,
    config,
    connection,
    nextMessageId,
    pendingWorkingDirectoryRestore,
    persistSnapshot,
    sessionVersion: chatHistory.sessionVersion,
    saveTimeout,
    setLoadingHistory,
    setPrompt,
    setTurns,
    skipHydratedSnapshot,
    stopChat: chat.stop,
    submissionInFlight,
    workingDirectory,
  });

  const messages = useMemo(
    () => buildChatMessages(turns, chat.messages, activeAssistantMessageId.current),
    [chat.messages, turns],
  );
  const conversationStarted = chatHistory.activeChatId !== undefined || messages.length > 0;

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
        generatedApps.refresh();
      });
  };

  const stopResponse = () => {
    connection.interruptActive();
    chat.stop();
    submissionInFlight.current = false;
    const chatId = chatMetadata.current?.id;
    if (chatId) chatHistoryRef.current.setChatRunning(chatId, false);
    finishActiveTurn();
  };

  return {
    conversationStarted,
    loadingHistory,
    messages,
    pending:
      chat.isLoading ||
      loadingHistory ||
      turns.some(
        (turn) =>
          turn.completedAtMs === undefined &&
          turn.assistantMessageId === activeAssistantMessageId.current,
      ),
    prompt,
    resolveApproval,
    setPrompt,
    stopResponse,
    submitPrompt,
  };
};
