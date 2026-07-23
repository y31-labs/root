import { createFileRoute } from '@tanstack/react-router';

import { ChatConversation } from '#/components/home/conversation';
import { ChatInput } from '#/components/prompt-input/chat-input';
import { useChat } from '#/hooks/use-chat';
import { useModelSettings } from '#/hooks/use-model-settings';
import { useWorkingDirectory } from '#/hooks/use-working-directory';
import { useLocalApi } from '#/providers/local-api-provider';

export const Route = createFileRoute('/')({ component: HomeRoute });

function HomeRoute() {
  const api = useLocalApi();
  const { selectWorkingDirectory, workingDirectory } = useWorkingDirectory();
  const modelSettings = useModelSettings(api.listModels);
  const { messages, pending, prompt, setPrompt, submitPrompt } = useChat({
    settings: modelSettings.settings,
    workingDirectory,
  });

  return (
    <main className='flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground'>
      <ChatConversation messages={messages} />
      <ChatInput
        modelSettings={modelSettings}
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
