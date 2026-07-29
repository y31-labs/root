import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import {
  collectAttachmentStorageKeys,
  normalizeStoredMessages,
  type ChatRecord,
} from '#/lib/chat-history';
import type { CodexChatConnection } from '#/lib/codex-chat-connection';
import {
  greatestMessageNumber,
  hydrateTurns,
  resetRunningTurn,
  runForIncompleteTurn,
  type CodexTurn,
} from '#/lib/codex-chat-turns';
import type { LocalApi } from '#/lib/local-api';
import type { useChatHistory } from '#/providers/chat-history-provider';

export type CodexChatMetadata = Pick<
  ChatRecord,
  'createdAtMs' | 'id' | 'title' | 'workingDirectory'
>;

interface CurrentRef<T> {
  current: T;
}

interface UseCodexChatSessionOptions {
  activeAssistantMessageId: CurrentRef<string | undefined>;
  api: Pick<LocalApi, 'getCodexRun'>;
  attachmentStorageKeys: CurrentRef<Record<string, string>>;
  clearChat: () => void;
  chatHistoryRef: CurrentRef<ReturnType<typeof useChatHistory>>;
  chatMetadata: CurrentRef<CodexChatMetadata | undefined>;
  chatSnapshot: CurrentRef<ChatRecord | undefined>;
  config: CurrentRef<{
    onWorkingDirectoryChange?: (workingDirectory: string | undefined) => void;
    workingDirectory?: string;
  }>;
  connection: CodexChatConnection;
  nextMessageId: CurrentRef<number>;
  pendingWorkingDirectoryRestore: CurrentRef<{ value: string | undefined } | undefined>;
  persistSnapshot: () => Promise<void>;
  sessionVersion: number;
  saveTimeout: CurrentRef<number | undefined>;
  setLoadingHistory: Dispatch<SetStateAction<boolean>>;
  setPrompt: Dispatch<SetStateAction<string>>;
  setTurns: Dispatch<SetStateAction<CodexTurn[]>>;
  skipHydratedSnapshot: CurrentRef<boolean>;
  stopChat: () => void;
  submissionInFlight: CurrentRef<boolean>;
  workingDirectory?: string;
}

export const useCodexChatSession = ({
  activeAssistantMessageId,
  api,
  attachmentStorageKeys,
  clearChat,
  chatHistoryRef,
  chatMetadata,
  chatSnapshot,
  config,
  connection,
  nextMessageId,
  pendingWorkingDirectoryRestore,
  persistSnapshot,
  sessionVersion,
  saveTimeout,
  setLoadingHistory,
  setPrompt,
  setTurns,
  skipHydratedSnapshot,
  stopChat,
  submissionInFlight,
  workingDirectory,
}: UseCodexChatSessionOptions) => {
  useEffect(() => {
    const archivedChatId = chatHistoryRef.current.archivedChatId;
    const archiveSnapshot = chatSnapshot.current?.id === archivedChatId;
    if (archiveSnapshot && saveTimeout.current !== undefined) {
      window.clearTimeout(saveTimeout.current);
      saveTimeout.current = undefined;
    }
    if (archiveSnapshot) connection.interruptActive();
    const pendingSave = archiveSnapshot ? Promise.resolve() : persistSnapshot();
    const previousChatId = chatMetadata.current?.id;
    if (previousChatId) chatHistoryRef.current.setChatRunning(previousChatId, false);
    chatSnapshot.current = undefined;
    chatMetadata.current = undefined;
    attachmentStorageKeys.current = {};
    skipHydratedSnapshot.current = false;
    stopChat();
    connection.resetThread();
    clearChat();
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
    void Promise.all([
      pendingSave.then(() => loadChat(activeChatId)),
      api.getCodexRun(activeChatId).catch((error: unknown) => {
        console.error(error);
        return null;
      }),
    ])
      .then(([storedChat, availableRun]) => {
        if (!active || !storedChat) return;
        const resumableRun = runForIncompleteTurn(storedChat, availableRun ?? undefined);
        const normalized = resumableRun
          ? resetRunningTurn(storedChat.messages, resumableRun.assistantMessageId)
          : normalizeStoredMessages(storedChat.messages, storedChat.updatedAtMs);
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
        const hydratedTurns = hydrateTurns(
          normalizedChat.messages,
          normalizedChat.updatedAtMs,
          resumableRun?.assistantMessageId,
        );
        chatMetadata.current = {
          id: normalizedChat.id,
          title: normalizedChat.title,
          createdAtMs: normalizedChat.createdAtMs,
          workingDirectory: normalizedChat.workingDirectory,
        };
        chatSnapshot.current = normalizedChat;
        attachmentStorageKeys.current = collectAttachmentStorageKeys(normalizedChat.messages);
        skipHydratedSnapshot.current = normalizedChat.messages.length > 0;
        activeAssistantMessageId.current = resumableRun?.assistantMessageId;
        connection.restoreChat(
          normalizedChat.id,
          canRestoreThread ? normalizedChat.codexThreadId : undefined,
          canRestoreThread ? resumableRun : undefined,
        );
        nextMessageId.current = greatestMessageNumber(normalizedChat.messages);
        setTurns(hydratedTurns);
        if (normalized.changed && !resumableRun) {
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
  }, [
    activeAssistantMessageId,
    api,
    attachmentStorageKeys,
    clearChat,
    chatHistoryRef,
    chatMetadata,
    chatSnapshot,
    config,
    connection,
    nextMessageId,
    pendingWorkingDirectoryRestore,
    persistSnapshot,
    saveTimeout,
    sessionVersion,
    setLoadingHistory,
    setPrompt,
    setTurns,
    skipHydratedSnapshot,
    stopChat,
    submissionInFlight,
  ]);

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
    stopChat();
    connection.resetThread();
    clearChat();
    setTurns([]);
    activeAssistantMessageId.current = undefined;
    submissionInFlight.current = false;
    chatHistoryRef.current.newChat();
  }, [
    activeAssistantMessageId,
    attachmentStorageKeys,
    clearChat,
    chatHistoryRef,
    chatMetadata,
    chatSnapshot,
    connection,
    pendingWorkingDirectoryRestore,
    persistSnapshot,
    setTurns,
    skipHydratedSnapshot,
    stopChat,
    submissionInFlight,
    workingDirectory,
  ]);
};
