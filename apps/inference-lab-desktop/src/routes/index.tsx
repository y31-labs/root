import { createFileRoute } from '@tanstack/react-router';
import {
  Conversation,
  ConversationEmptyState,
} from '@workspace/ui/components/ai-elements/conversation';
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@workspace/ui/components/ai-elements/prompt-input';
import { Button } from '@workspace/ui/components/ui/button';
import { Mic, Plus } from 'lucide-react';
import { type SyntheticEvent, useState } from 'react';

import { ModelSelectDropdown } from '#/components/model-select-dropdown';

export const Route = createFileRoute('/')({ component: HomeRoute });

function HomeRoute() {
  const [prompt, setPrompt] = useState('');

  const submitPrompt = (event: SyntheticEvent<HTMLFormElement>) => event.preventDefault();

  return (
    <main className='flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground'>
      <Conversation className='flex'>
        <ConversationEmptyState className='min-h-0 flex-col gap-4 pb-4'>
          <div className='flex size-11 items-center justify-center rounded-xl border bg-muted/40'>
            <img src='/y31-logo.svg' alt='' aria-hidden='true' className='h-6 w-auto opacity-70' />
          </div>
          <div>
            <h1 className='text-xl font-medium tracking-tight text-foreground sm:text-2xl'>
              What should we build?
            </h1>
            <p className='mt-2 text-sm text-muted-foreground'>
              Describe an internal tool, workflow, or process.
            </p>
          </div>
        </ConversationEmptyState>
      </Conversation>

      <div className='shrink-0 px-4 pb-4 sm:px-8 sm:pb-5'>
        <PromptInput
          className='mx-auto w-full max-w-3xl rounded-2xl bg-muted/40 shadow-none focus-within:border-border'
          onSubmit={submitPrompt}
        >
          <label htmlFor='chat-prompt' className='sr-only'>
            Describe what you want to build
          </label>
          <PromptInputTextarea
            id='chat-prompt'
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder='What do you want to build?'
            autoFocus
            className='min-h-20 px-4 pb-2 pt-3.5 text-[15px] leading-6 placeholder:text-muted-foreground/80 dark:bg-transparent'
          />
          <PromptInputFooter className='px-2.5 pb-2.5'>
            <PromptInputTools>
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                className='rounded-full'
                aria-label='Add context'
              >
                <Plus />
              </Button>
            </PromptInputTools>

            <PromptInputTools className='gap-0.5'>
              <ModelSelectDropdown />
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                className='rounded-full'
                aria-label='Use voice input'
              >
                <Mic />
              </Button>
              <PromptInputSubmit className='ml-1.5 rounded-full' disabled={!prompt.trim()} />
            </PromptInputTools>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </main>
  );
}
