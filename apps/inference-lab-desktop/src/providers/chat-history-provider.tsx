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
import type { ModelSettings } from '#/lib/types';
import { useLocalApi } from '#/providers/local-api-provider';

interface ChatTitleGenerationRequest {
  chatId: string;
  filenames: string[];
  firstPrompt: string;
  settings?: ModelSettings;
}

interface QueuedChatTitleGeneration extends ChatTitleGenerationRequest {
  resolve: (title: string | undefined) => void;
  started: boolean;
}

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

const updateIdSet = (current: Set<string>, id: string, included: boolean) => {
  if (current.has(id) === included) return current;
  const next = new Set(current);
  if (included) next.add(id);
  else next.delete(id);
  return next;
};

export function ChatHistoryProvider({ children }: { children: ReactNode }) {
  const api = useLocalApi();
  const [activeChatId, setActiveChatId] = useState<string>();
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [archivedChatId, setArchivedChatId] = useState<string>();
  const [generatingTitleChatIds, setGeneratingTitleChatIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [historyWarning, setHistoryWarning] = useState<string>();
  const [runningChatIds, setRunningChatIds] = useState<Set<string>>(() => new Set());
  const [sessionVersion, setSessionVersion] = useState(0);
  const queuedTitleGenerations = useRef(new Map<string, QueuedChatTitleGeneration>());

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
  const finishTitleGeneration = useCallback(
    (request: QueuedChatTitleGeneration, title: string | undefined) => {
      if (queuedTitleGenerations.current.get(request.chatId) !== request) return;
      queuedTitleGenerations.current.delete(request.chatId);
      setGeneratingTitleChatIds((current) => updateIdSet(current, request.chatId, false));
      request.resolve(title);
    },
    [],
  );
  const runQueuedTitleGeneration = useCallback(
    (chatId: string) => {
      const queued = queuedTitleGenerations.current.get(chatId);
      if (!queued || queued.started) return;
      queued.started = true;
      void api
        .generateChatTitle(queued.firstPrompt, queued.filenames, queued.settings)
        .then(async (generatedTitle) => {
          if (queuedTitleGenerations.current.get(chatId) !== queued) return undefined;
          const title = typeof generatedTitle === 'string' ? generatedTitle.trim() : '';
          if (!title) return undefined;
          await api.renameChat(chatId, title);
          setChats((current) =>
            current.map((chat) => (chat.id === chatId ? { ...chat, title } : chat)),
          );
          return title;
        })
        .catch((error: unknown) => {
          console.error(error);
          return undefined;
        })
        .then((title) => finishTitleGeneration(queued, title));
    },
    [api, finishTitleGeneration],
  );
  const generateChatTitle = useCallback(
    (request: ChatTitleGenerationRequest) =>
      new Promise<string | undefined>((resolve) => {
        const existing = queuedTitleGenerations.current.get(request.chatId);
        if (existing) {
          existing.resolve(undefined);
        }
        queuedTitleGenerations.current.set(request.chatId, {
          ...request,
          resolve,
          started: false,
        });
        setGeneratingTitleChatIds((current) => updateIdSet(current, request.chatId, true));
      }),
    [],
  );
  const setChatRunning = useCallback((chatId: string, running: boolean) => {
    setRunningChatIds((current) => updateIdSet(current, chatId, running));
  }, []);
  const archiveChat = useCallback(
    async (chatId: string) => {
      await api.archiveChat(chatId);
      setChats((current) => current.filter((chat) => chat.id !== chatId));
      const titleGeneration = queuedTitleGenerations.current.get(chatId);
      if (titleGeneration) finishTitleGeneration(titleGeneration, undefined);
      setRunningChatIds((current) => updateIdSet(current, chatId, false));
      if (activeChatIdRef.current === chatId) {
        setArchivedChatId(chatId);
        setActiveChatId(undefined);
        setSessionVersion((current) => current + 1);
      }
    },
    [api, finishTitleGeneration],
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
      runQueuedTitleGeneration(result.id);
      return result;
    },
    [api, runQueuedTitleGeneration],
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
