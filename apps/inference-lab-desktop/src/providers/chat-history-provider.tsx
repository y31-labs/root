import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { ChatRecord, ChatSaveResult, ChatSummary } from '#/lib/chat-history';
import { useLocalApi } from '#/providers/local-api-provider';

interface ChatHistoryContextValue {
  activeChatId?: string;
  chats: ChatSummary[];
  sessionVersion: number;
  activateChat: (chatId: string) => void;
  archiveChat: (chatId: string) => Promise<void>;
  archivedChatId?: string;
  historyWarning?: string;
  loadChat: (chatId: string) => Promise<ChatRecord | null>;
  newChat: () => void;
  openChat: (chatId: string) => void;
  persistChat: (chat: ChatRecord) => Promise<ChatSaveResult | undefined>;
}

const noChatHistory: ChatHistoryContextValue = {
  chats: [],
  sessionVersion: 0,
  activateChat: () => undefined,
  archiveChat: () => Promise.resolve(),
  loadChat: () => Promise.resolve(null),
  newChat: () => undefined,
  openChat: () => undefined,
  persistChat: () => Promise.resolve(undefined),
};

const ChatHistoryContext = createContext<ChatHistoryContextValue>(noChatHistory);

const sortChats = (chats: ChatSummary[]) =>
  [...chats].sort((left, right) => right.updatedAtMs - left.updatedAtMs);

export function ChatHistoryProvider({ children }: { children: ReactNode }) {
  const api = useLocalApi();
  const [activeChatId, setActiveChatId] = useState<string>();
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [archivedChatId, setArchivedChatId] = useState<string>();
  const [historyWarning, setHistoryWarning] = useState<string>();
  const [sessionVersion, setSessionVersion] = useState(0);

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
  const archiveChat = useCallback(
    async (chatId: string) => {
      await api.archiveChat(chatId);
      setChats((current) => current.filter((chat) => chat.id !== chatId));
      if (activeChatIdRef.current === chatId) {
        setArchivedChatId(chatId);
        setActiveChatId(undefined);
        setSessionVersion((current) => current + 1);
      }
    },
    [api],
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
      return result;
    },
    [api],
  );

  const value = useMemo(
    () => ({
      activeChatId,
      archivedChatId,
      archiveChat,
      chats,
      sessionVersion,
      activateChat,
      historyWarning,
      loadChat,
      newChat,
      openChat,
      persistChat,
    }),
    [
      activeChatId,
      activateChat,
      archivedChatId,
      archiveChat,
      chats,
      historyWarning,
      loadChat,
      newChat,
      openChat,
      persistChat,
      sessionVersion,
    ],
  );

  return <ChatHistoryContext.Provider value={value}>{children}</ChatHistoryContext.Provider>;
}

export const useChatHistory = () => useContext(ChatHistoryContext);
