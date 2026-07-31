import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  useChatTitleGeneration,
  type ChatTitleGenerationRequest,
} from '#/hooks/use-chat-title-generation';
import { useLatest } from '#/hooks/use-latest';
import type { ChatRecord, ChatSaveResult, ChatSummary } from '#/lib/chat-history';
import { updateSetMembership } from '#/lib/sets';
import { useLocalApi } from '#/providers/local-api-provider';

interface ChatHistoryContextValue {
  activeChatId?: string;
  chats: ChatSummary[];
  generatingTitleChatIds: ReadonlySet<string>;
  runningChatIds: ReadonlySet<string>;
  sessionVersion: number;
  activateChat: (chatId: string) => void;
  archiveChat: (chatId: string) => Promise<void>;
  archivedChatId?: string;
  generateChatTitle: (request: ChatTitleGenerationRequest) => Promise<string | undefined>;
  historyWarning?: string;
  loadChat: (chatId: string) => Promise<ChatRecord | null>;
  newChat: () => void;
  openChat: (chatId: string) => void;
  persistChat: (chat: ChatRecord) => Promise<ChatSaveResult | undefined>;
  setChatRunning: (chatId: string, running: boolean) => void;
}

const noChatHistory: ChatHistoryContextValue = {
  chats: [],
  generatingTitleChatIds: new Set(),
  runningChatIds: new Set(),
  sessionVersion: 0,
  activateChat: () => undefined,
  archiveChat: () => Promise.resolve(),
  generateChatTitle: () => Promise.resolve(undefined),
  loadChat: () => Promise.resolve(null),
  newChat: () => undefined,
  openChat: () => undefined,
  persistChat: () => Promise.resolve(undefined),
  setChatRunning: () => undefined,
};

const ChatHistoryContext = createContext<ChatHistoryContextValue>(noChatHistory);

const sortChats = (chats: ChatSummary[]) =>
  [...chats].sort((left, right) => right.updatedAtMs - left.updatedAtMs);

export function ChatHistoryProvider({ children }: { children: ReactNode }) {
  const api = useLocalApi();
  const [activeChatId, setActiveChatId] = useState<string>();
  const activeChatIdRef = useLatest(activeChatId);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [archivedChatId, setArchivedChatId] = useState<string>();
  const [historyWarning, setHistoryWarning] = useState<string>();
  const [runningChatIds, setRunningChatIds] = useState<Set<string>>(() => new Set());
  const [sessionVersion, setSessionVersion] = useState(0);
  const onTitleGenerated = useCallback((chatId: string, title: string) => {
    setChats((current) => current.map((chat) => (chat.id === chatId ? { ...chat, title } : chat)));
  }, []);
  const {
    cancelChatTitleGeneration,
    generateChatTitle,
    generatingTitleChatIds,
    runChatTitleGeneration,
  } = useChatTitleGeneration(api, onTitleGenerated);

  useEffect(() => {
    let active = true;
    void api
      .listChats()
      .then((nextChats) => {
        if (active) setChats(sortChats(nextChats));
      })
      .catch(console.error);
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    let active = true;
    void api
      .chatHistoryStatus()
      .then((status) => {
        if (active) setHistoryWarning(status?.warning);
      })
      .catch(console.error);
    return () => {
      active = false;
    };
  }, [api]);

  const newChat = useCallback(() => {
    setArchivedChatId(undefined);
    setActiveChatId(undefined);
    setSessionVersion((current) => current + 1);
  }, []);

  const openChat = useCallback((chatId: string) => {
    setArchivedChatId(undefined);
    setActiveChatId(chatId);
    setSessionVersion((current) => current + 1);
  }, []);

  const activateChat = useCallback((chatId: string) => setActiveChatId(chatId), []);
  const setChatRunning = useCallback((chatId: string, running: boolean) => {
    setRunningChatIds((current) => updateSetMembership(current, chatId, running));
  }, []);
  const archiveChat = useCallback(
    async (chatId: string) => {
      await api.archiveChat(chatId);
      setChats((current) => current.filter((chat) => chat.id !== chatId));
      cancelChatTitleGeneration(chatId);
      setRunningChatIds((current) => updateSetMembership(current, chatId, false));
      if (activeChatIdRef.current === chatId) {
        setArchivedChatId(chatId);
        setActiveChatId(undefined);
        setSessionVersion((current) => current + 1);
      }
    },
    [api, cancelChatTitleGeneration],
  );
  const loadChat = useCallback((chatId: string) => api.getChat(chatId), [api]);
  const persistChat = useCallback(
    async (chat: ChatRecord) => {
      const result = await api.saveChat(chat);
      const summary: ChatSummary = {
        id: result.id,
        title: result.title,
        createdAtMs: result.createdAtMs,
        updatedAtMs: result.updatedAtMs,
      };
      setChats((current) =>
        sortChats([summary, ...current.filter((candidate) => candidate.id !== summary.id)]),
      );
      runChatTitleGeneration(result.id);
      return result;
    },
    [api, runChatTitleGeneration],
  );

  const value = useMemo(
    () => ({
      activeChatId,
      archivedChatId,
      archiveChat,
      chats,
      generateChatTitle,
      generatingTitleChatIds,
      sessionVersion,
      activateChat,
      historyWarning,
      loadChat,
      newChat,
      openChat,
      persistChat,
      runningChatIds,
      setChatRunning,
    }),
    [
      activeChatId,
      activateChat,
      archivedChatId,
      archiveChat,
      chats,
      generateChatTitle,
      generatingTitleChatIds,
      historyWarning,
      loadChat,
      newChat,
      openChat,
      persistChat,
      runningChatIds,
      sessionVersion,
      setChatRunning,
    ],
  );

  return <ChatHistoryContext.Provider value={value}>{children}</ChatHistoryContext.Provider>;
}

export const useChatHistory = () => useContext(ChatHistoryContext);
