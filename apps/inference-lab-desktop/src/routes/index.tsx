import { createFileRoute } from '@tanstack/react-router';
import { open } from '@tauri-apps/plugin-dialog';
import type { PromptInputMessage } from '@workspace/ui/components/ai-elements/prompt-input';
import { useRef, useState } from 'react';

import { ChatConversation, type ChatMessage } from '#/components/home/conversation';
import { ChatInput } from '#/components/prompt-input/chat-input';
import type { CodexStreamEvent } from '#/lib/types';
import { useLocalApi } from '#/providers/local-api-provider';

export const Route = createFileRoute('/')({ component: HomeRoute });

const WORKING_DIRECTORY_KEY = 'y31:working-directory';

function HomeRoute() {
  const api = useLocalApi();
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [workingDirectory, setWorkingDirectory] = useState<string | undefined>(
    () => window.localStorage.getItem(WORKING_DIRECTORY_KEY) ?? undefined,
  );
  const threadId = useRef<string | undefined>(undefined);
  const nextMessageId = useRef(0);

  const selectWorkingDirectory = async () => {
    const selected = await open({
      defaultPath: workingDirectory,
      directory: true,
      multiple: false,
    });
    if (!selected || Array.isArray(selected)) return;
    setWorkingDirectory(selected);
    window.localStorage.setItem(WORKING_DIRECTORY_KEY, selected);
  };

  const submitPrompt = ({ files, text: submittedText }: PromptInputMessage) => {
    const text = submittedText.trim();
    if ((!text && files.length === 0) || pending) return;

    const userMessage: ChatMessage = {
      attachments: files.map((file, index) => ({
        ...file,
        id: `message-${nextMessageId.current + 1}-file-${index}`,
      })),
      id: ++nextMessageId.current,
      role: 'user',
      text,
    };
    const assistantId = ++nextMessageId.current;
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: 'assistant', text: '', streaming: true },
    ]);
    setPrompt('');
    setPending(true);

    const handleEvent = (streamEvent: CodexStreamEvent) => {
      if (streamEvent.type === 'started') {
        threadId.current = streamEvent.threadId;
        return;
      }
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== assistantId) return message;
          if (streamEvent.type === 'delta') {
            return { ...message, text: message.text + streamEvent.text };
          }
          return { ...message, streaming: false };
        }),
      );
    };

    void (async () => {
      try {
        const result = await api.streamCodexText(
          text,
          files.map((file) => ({
            dataUrl: file.url,
            filename: file.filename ?? 'attachment',
            mediaType: file.mediaType || 'application/octet-stream',
          })),
          workingDirectory,
          threadId.current,
          handleEvent,
        );
        threadId.current = result.threadId;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, streaming: false } : message,
          ),
        );
      } catch (nextError) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, streaming: false, error: errorMessage(nextError) }
              : message,
          ),
        );
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <main className='flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground'>
      <ChatConversation messages={messages} />
      <ChatInput
        pending={pending}
        prompt={prompt}
        workingDirectory={workingDirectory}
        onPromptChange={setPrompt}
        onSelectWorkingDirectory={() => void selectWorkingDirectory()}
        onSubmit={submitPrompt}
      />
    </main>
  );
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';
