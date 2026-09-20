import { createContext, useContext, useState, type ReactNode } from 'react';

interface ChatDraft {
  id: string;
  title: string;
  prompts: string[];
}

interface ChatDraftsContextValue {
  chats: ChatDraft[];
  activeChatId: string;
  activeChat: ChatDraft | undefined;
  newChat: () => void;
  openChat: (id: string) => void;
  savePrompt: (text: string) => void;
}

const ChatDraftsContext = createContext<ChatDraftsContextValue | null>(null);

// Frontend drafts live only for this page session, until a backend is connected.
export function ChatDraftsProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<ChatDraft[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>(() => crypto.randomUUID());
  const activeChat = chats.find((chat) => chat.id === activeChatId);

  const savePrompt = (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;

    if (activeChat) {
      setChats((current) =>
        current.map((chat) =>
          chat.id === activeChatId ? { ...chat, prompts: [...chat.prompts, prompt] } : chat,
        ),
      );
      return;
    }

    setChats((current) => [{ id: activeChatId, title: prompt, prompts: [prompt] }, ...current]);
  };

  return (
    <ChatDraftsContext
      value={{
        chats,
        activeChatId,
        activeChat,
        newChat: () => setActiveChatId(crypto.randomUUID()),
        openChat: setActiveChatId,
        savePrompt,
      }}
    >
      {children}
    </ChatDraftsContext>
  );
}

export const useChatDrafts = () => {
  const context = useContext(ChatDraftsContext);
  if (!context) throw new Error('useChatDrafts must be used within ChatDraftsProvider');
  return context;
};
