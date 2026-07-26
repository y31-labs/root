import { createFileRoute } from '@tanstack/react-router';

import { ChatConversation } from '#/components/home/conversation';
import { ChatInput } from '#/components/prompt-input/chat-input';
import { useCodexChat } from '#/hooks/use-codex-chat';
import { useModelSettings } from '#/hooks/use-model-settings';
import { usePermissionMode } from '#/hooks/use-permission-mode';
import { useWorkingDirectory } from '#/hooks/use-working-directory';
import { useLocalApi } from '#/providers/local-api-provider';

export const Route = createFileRoute('/')({ component: HomeRoute });

function HomeRoute() {
  const api = useLocalApi();
  const { selectWorkingDirectory, setWorkingDirectory, workingDirectory } = useWorkingDirectory();
  const modelSettings = useModelSettings(api.listModels);
  const { permissionMode, setPermissionMode } = usePermissionMode();
  const {
    conversationStarted,
    loadingHistory,
    messages,
    pending,
    prompt,
    resolveApproval,
    setPrompt,
    stopResponse,
    submitPrompt,
  } = useCodexChat({
    onWorkingDirectoryChange: setWorkingDirectory,
    permissionMode,
    settings: modelSettings.settings,
    workingDirectory,
  });

  return (
    <main className='flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground'>
      <ChatConversation
        loading={loadingHistory}
        messages={messages}
        onApprovalDecision={resolveApproval}
      />
      <ChatInput
        conversationStarted={conversationStarted}
        modelSettings={modelSettings}
        pending={pending}
        permissionMode={permissionMode}
        prompt={prompt}
        workingDirectory={workingDirectory}
        onPromptChange={setPrompt}
        onPermissionModeChange={setPermissionMode}
        onSelectWorkingDirectory={selectWorkingDirectory}
        onStop={stopResponse}
        onSubmit={submitPrompt}
      />
    </main>
  );
}
