import type { PromptInputMessage } from '@workspace/ui/components/ai-elements/prompt-input';
import { useRef, useState } from 'react';

import type { ChatMessage } from '#/components/home/conversation';
import type { ChatStreamEvent } from '#/lib/types';
import { useLocalApi } from '#/providers/local-api-provider';

interface UseChatOptions {
  workingDirectory?: string;
}

export const useChat = ({ workingDirectory }: UseChatOptions) => {
  const api = useLocalApi();
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const threadId = useRef<string | undefined>(undefined);
  const nextMessageId = useRef(0);

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

    const handleEvent = (streamEvent: ChatStreamEvent) => {
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
        const result = await api.streamChatText(
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

  return { messages, pending, prompt, setPrompt, submitPrompt };
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';
