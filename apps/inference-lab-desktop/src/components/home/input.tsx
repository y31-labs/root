import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputProps,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@workspace/ui/components/ai-elements/prompt-input';
import { Mic, Plus } from 'lucide-react';

import { ModelSelectDropdown } from '#/components/model-select-dropdown';

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
        onSubmit={onSubmit}
      >
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
        <PromptInputFooter className='px-2.5 pb-2.5'>
          <PromptInputTools>
            <PromptInputButton className='rounded-full' aria-label='Add context'>
              <Plus />
            </PromptInputButton>
          </PromptInputTools>

          <PromptInputTools className='gap-0.5'>
            <ModelSelectDropdown />
            <PromptInputButton className='rounded-full' aria-label='Use voice input'>
              <Mic />
            </PromptInputButton>
            <PromptInputSubmit
              className='ml-1.5 rounded-full'
              disabled={pending || !prompt.trim()}
              status={pending ? 'submitted' : 'ready'}
            />
          </PromptInputTools>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
