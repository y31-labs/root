import { createFileRoute } from '@tanstack/react-router';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@workspace/ui/components/ai-elements/conversation';
import { Button } from '@workspace/ui/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@workspace/ui/components/ui/input-group';
import { ArrowUp, ArrowUpRight } from 'lucide-react';
import { useRef, useState } from 'react';

import { useChatDrafts } from '#/providers/chat-drafts-provider';

export const Route = createFileRoute('/')({ component: HomeRoute });

const suggestions = [
  {
    title: 'An internal tool',
    prompt: 'Build an internal tool to manage our team’s projects and tasks.',
  },
  { title: 'A simpler workflow', prompt: 'Help me streamline our client onboarding workflow.' },
  {
    title: 'A team dashboard',
    prompt: 'Build a dashboard to see our team’s priorities and progress.',
  },
];

export function HomeRoute() {
  const { activeChatId } = useChatDrafts();
  return <ChatWorkspace key={activeChatId} />;
}

export function ChatWorkspace() {
  const { activeChat, savePrompt } = useChatDrafts();
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  return (
    <>
      <Conversation className='min-h-0' initial='instant' resize='instant' aria-label='Chat drafts'>
        <ConversationContent className='mx-auto min-h-full w-full max-w-3xl px-5 py-8 sm:px-8'>
          {activeChat ? (
            <>
              {activeChat.prompts.map((text, index) => (
                <div
                  key={index}
                  className='ml-auto max-w-full rounded-xl bg-secondary px-5 py-4 text-secondary-foreground sm:max-w-[85%]'
                >
                  <p className='mb-2 text-xs font-bold text-muted-foreground'>You</p>
                  <p className='whitespace-pre-wrap wrap-anywhere text-sm leading-7'>{text}</p>
                </div>
              ))}
              <p role='status' className='text-sm leading-6 text-muted-foreground'>
                Draft saved for this session. AI responses aren’t connected yet.
              </p>
            </>
          ) : (
            <ConversationEmptyState className='flex-1 gap-6 px-0'>
              <img src='/austi-logo.svg' alt='' className='h-11 w-auto invert dark:invert-0' />
              <div>
                <h1 className='text-3xl font-bold tracking-tight sm:text-5xl'>
                  What should we build?
                </h1>
                <p className='mt-4 text-sm leading-6 text-muted-foreground sm:text-base'>
                  Describe an internal tool, workflow, or process.
                </p>
              </div>
              <div className='mt-3 flex w-full flex-col divide-y border-y text-left sm:flex-row sm:divide-x sm:divide-y-0'>
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion.title}
                    variant='ghost'
                    className='h-auto min-w-0 flex-1 justify-between rounded-none px-3 py-4 text-xs font-normal sm:text-sm'
                    onClick={() => {
                      setPrompt(suggestion.prompt);
                      inputRef.current?.focus();
                    }}
                  >
                    {suggestion.title}
                    <ArrowUpRight className='size-3.5 shrink-0' />
                  </Button>
                ))}
              </div>
            </ConversationEmptyState>
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label='Scroll to latest draft' />
      </Conversation>
      <div className='shrink-0 px-4 pb-5 sm:px-8 sm:pb-6'>
        <div className='mx-auto w-full max-w-3xl'>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              savePrompt(prompt);
              setPrompt('');
            }}
          >
            <label htmlFor='chat-prompt' className='sr-only'>
              Describe what you want to build
            </label>
            <InputGroup className='rounded-xl bg-card shadow-none'>
              <InputGroupTextarea
                ref={inputRef}
                id='chat-prompt'
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    event.nativeEvent.keyCode !== 229
                  ) {
                    event.preventDefault();
                    if (prompt.trim()) event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder='What do you want to build?'
                aria-describedby='draft-notice'
                className='max-h-48 min-h-24 px-4 pt-4 text-base leading-6 sm:text-sm'
              />
              <InputGroupAddon align='block-end' className='justify-between px-3 pb-3'>
                <span id='draft-notice' className='px-1 text-xs font-normal text-muted-foreground'>
                  Draft only · clears on refresh
                </span>
                <InputGroupButton
                  type='submit'
                  variant='default'
                  size='icon-sm'
                  disabled={!prompt.trim()}
                  aria-label='Save chat draft'
                  className='rounded-full'
                >
                  <ArrowUp />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </div>
      </div>
    </>
  );
}
