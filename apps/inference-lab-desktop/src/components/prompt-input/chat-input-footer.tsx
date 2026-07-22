import {
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
  usePromptInputAttachments,
} from '@workspace/ui/components/ai-elements/prompt-input';
import { Mic, Paperclip } from 'lucide-react';

import { ModelSelectDropdown } from '#/components/model-select-dropdown';

interface ChatInputFooterProps {
  pending: boolean;
  prompt: string;
}

export function ChatInputFooter({ pending, prompt }: ChatInputFooterProps) {
  const attachments = usePromptInputAttachments();
  const canSubmit = Boolean(prompt.trim() || attachments.files.length);

  return (
    <PromptInputFooter className='px-2.5 pb-2.5'>
      <PromptInputTools>
        <PromptInputButton
          aria-label='Attach files'
          className='rounded-full whitespace-nowrap'
          onClick={attachments.openFileDialog}
        >
          <Paperclip />
          Attach files
        </PromptInputButton>
      </PromptInputTools>

      <PromptInputTools className='gap-0.5'>
        <ModelSelectDropdown />
        <PromptInputButton className='rounded-full' aria-label='Use voice input'>
          <Mic />
        </PromptInputButton>
        <PromptInputSubmit
          className='ml-1.5 rounded-full'
          disabled={pending || !canSubmit}
          status={pending ? 'submitted' : 'ready'}
        />
      </PromptInputTools>
    </PromptInputFooter>
  );
}
