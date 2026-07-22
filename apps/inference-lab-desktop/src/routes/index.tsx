import { createFileRoute } from '@tanstack/react-router';

import { ChatConversation } from '#/components/home/conversation';
import { ChatInput } from '#/components/prompt-input/chat-input';
import { useChat } from '#/hooks/use-chat';
import { useWorkingDirectory } from '#/hooks/use-working-directory';

export const Route = createFileRoute('/')({ component: HomeRoute });

function HomeRoute() {
  const { selectWorkingDirectory, workingDirectory } = useWorkingDirectory();
  const { messages, pending, prompt, setPrompt, submitPrompt } = useChat({
    workingDirectory,
  });

  return (
    <main className='flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground'>
      <ChatConversation messages={messages} />
      <ChatInput
        pending={pending}
        prompt={prompt}
        workingDirectory={workingDirectory}
        onPromptChange={setPrompt}
        onSelectWorkingDirectory={selectWorkingDirectory}
        onSubmit={submitPrompt}
      />
    </main>
  );
}
