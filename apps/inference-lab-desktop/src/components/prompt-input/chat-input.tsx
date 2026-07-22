import {
  PromptInput,
  PromptInputBody,
  type PromptInputProps,
  PromptInputTextarea,
} from '@workspace/ui/components/ai-elements/prompt-input';

import { ChatInputFooter } from '#/components/prompt-input/chat-input-footer';
import { PromptAttachments } from '#/components/prompt-input/prompt-attachments';

const MAX_ATTACHMENT_FILES = 4;
const MAX_ATTACHMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file, up to 40 MB total.

interface ChatInputProps {
  pending: boolean;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onSubmit: PromptInputProps['onSubmit'];
}

export function ChatInput({ pending, prompt, onPromptChange, onSubmit }: ChatInputProps) {
  return (
    <div className='shrink-0 px-4 pb-4 sm:px-8 sm:pb-5'>
      <PromptInput
        className='mx-auto w-full max-w-3xl *:data-[slot=input-group]:rounded-2xl *:data-[slot=input-group]:bg-muted/40 *:data-[slot=input-group]:shadow-none *:data-[slot=input-group]:focus-within:border-border dark:*:data-[slot=input-group]:bg-muted/40'
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
            disabled={pending}
            className='min-h-20 px-4 pb-2 pt-3.5 text-[15px] leading-6 placeholder:text-muted-foreground/80 disabled:opacity-100 dark:bg-transparent'
          />
        </PromptInputBody>
        <ChatInputFooter pending={pending} prompt={prompt} />
      </PromptInput>
    </div>
  );
}
