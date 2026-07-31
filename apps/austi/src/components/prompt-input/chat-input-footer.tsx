import {
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
  usePromptInputAttachments,
} from '@workspace/ui/components/ai-elements/prompt-input';
import { ArrowUp, Paperclip } from 'lucide-react';

import { ModelSelectDropdown } from '#/components/model-select-dropdown';
import { PermissionSelectDropdown } from '#/components/permission-select-dropdown';
import type { ModelSettingsState } from '#/hooks/use-model-settings';
import type { PermissionMode } from '#/lib/types';

interface ChatInputFooterProps {
  modelSettings: ModelSettingsState;
  pending: boolean;
  permissionMode: PermissionMode;
  onPermissionModeChange: (permissionMode: PermissionMode) => void;
  onStop: () => void;
}

export function ChatInputFooter({
  modelSettings,
  pending,
  permissionMode,
  onPermissionModeChange,
  onStop,
}: ChatInputFooterProps) {
  const attachments = usePromptInputAttachments();

  return (
    <PromptInputFooter className='px-2.5 pb-2.5'>
      <PromptInputTools className='min-w-0 flex-1'>
        <ModelSelectDropdown modelSettings={modelSettings} />
        <PermissionSelectDropdown
          permissionMode={permissionMode}
          onPermissionModeChange={onPermissionModeChange}
        />
      </PromptInputTools>

      <PromptInputTools className='gap-0.5'>
        <PromptInputButton
          aria-label='Attach files'
          className='rounded-full whitespace-nowrap'
          onClick={attachments.openFileDialog}
        >
          <Paperclip />
        </PromptInputButton>
        <PromptInputSubmit
          className='ml-1.5 rounded-full'
          onStop={onStop}
          status={pending ? 'streaming' : 'ready'}
        >
          {pending ? null : <ArrowUp />}
        </PromptInputSubmit>
      </PromptInputTools>
    </PromptInputFooter>
  );
}
