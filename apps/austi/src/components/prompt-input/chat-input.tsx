import {
  PromptInput,
  PromptInputBody,
  type PromptInputProps,
  PromptInputTextarea,
} from '@workspace/ui/components/ai-elements/prompt-input';

import { ChatInputFooter } from '#/components/prompt-input/chat-input-footer';
import { FolderPicker } from '#/components/prompt-input/folder-picker';
import { PromptAttachments } from '#/components/prompt-input/prompt-attachments';
import type { ModelSettingsState } from '#/hooks/use-model-settings';
import type { PermissionMode } from '#/lib/types';

const MAX_ATTACHMENT_FILES = 4;
const MAX_ATTACHMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file, up to 40 MB total.

interface ChatInputProps {
  conversationStarted: boolean;
  modelSettings: ModelSettingsState;
  pending: boolean;
  permissionMode: PermissionMode;
  prompt: string;
  workingDirectory?: string;
  onPromptChange: (prompt: string) => void;
  onPermissionModeChange: (permissionMode: PermissionMode) => void;
  onSelectWorkingDirectory: () => void;
  onStop: () => void;
  onSubmit: PromptInputProps['onSubmit'];
}

export function ChatInput({
  conversationStarted,
  modelSettings,
  pending,
  permissionMode,
  prompt,
  workingDirectory,
  onPromptChange,
  onPermissionModeChange,
  onSelectWorkingDirectory,
  onStop,
  onSubmit,
}: ChatInputProps) {
  return (
    <div className='shrink-0 px-4 pb-4 sm:px-8 sm:pb-5'>
      <div className='mx-auto w-full max-w-3xl'>
        {!conversationStarted && (
          <FolderPicker workingDirectory={workingDirectory} onSelect={onSelectWorkingDirectory} />
        )}
        <PromptInput
          className='w-full *:data-[slot=input-group]:rounded-2xl *:data-[slot=input-group]:bg-muted/40 *:data-[slot=input-group]:shadow-none *:data-[slot=input-group]:focus-within:border-border dark:*:data-[slot=input-group]:bg-muted/40'
          maxFiles={MAX_ATTACHMENT_FILES}
          maxFileSize={MAX_ATTACHMENT_FILE_SIZE_BYTES}
          multiple
          onSubmit={onSubmit}
        >
          <PromptAttachments />
          <label htmlFor='chat-prompt' className='sr-only'>
            Describe what you want to build
          </label>
          <PromptInputBody>
            <PromptInputTextarea
              id='chat-prompt'
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder='What do you want to build?'
              autoFocus
              className='min-h-20 px-4 pb-1 pt-3.5 text-[15px] leading-6 placeholder:text-muted-foreground/80 dark:bg-transparent'
            />
          </PromptInputBody>
          <ChatInputFooter
            modelSettings={modelSettings}
            pending={pending}
            permissionMode={permissionMode}
            onPermissionModeChange={onPermissionModeChange}
            onStop={onStop}
          />
        </PromptInput>
      </div>
    </div>
  );
}
