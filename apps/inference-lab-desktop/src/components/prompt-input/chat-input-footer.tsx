import {
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
  usePromptInputAttachments,
} from '@workspace/ui/components/ai-elements/prompt-input';
import { ArrowUp, Mic, Paperclip } from 'lucide-react';

import { ModelSelectDropdown } from '#/components/model-select-dropdown';
import type { ModelSettingsState } from '#/hooks/use-model-settings';

interface ChatInputFooterProps {
  modelSettings: ModelSettingsState;
  pending: boolean;
  prompt: string;
}

export function ChatInputFooter({ modelSettings, pending, prompt }: ChatInputFooterProps) {
  const attachments = usePromptInputAttachments();
  const canSubmit = Boolean(prompt.trim() || attachments.files.length);

  return (
    <PromptInputFooter className='px-2.5 pb-2.5'>
      <PromptInputTools className='w-56 min-w-0 shrink'>
        <ModelSelectDropdown disabled={pending} modelSettings={modelSettings} />
      </PromptInputTools>

      <PromptInputTools className='gap-0.5'>
        <PromptInputButton
          aria-label='Attach files'
          className='rounded-full whitespace-nowrap'
          onClick={attachments.openFileDialog}
        >
          <Paperclip />
          Attach files
        </PromptInputButton>
        <PromptInputButton className='rounded-full' aria-label='Use voice input'>
          <Mic />
        </PromptInputButton>
        <PromptInputSubmit
          className='ml-1.5 rounded-full'
          disabled={pending || !canSubmit}
          status={pending ? 'submitted' : 'ready'}
        >
          {pending || <ArrowUp />}
        </PromptInputSubmit>
      </PromptInputTools>
    </PromptInputFooter>
  );
}
