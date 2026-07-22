import { ConversationEmptyState } from '@workspace/ui/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@workspace/ui/components/ai-elements/message';
import { Shimmer } from '@workspace/ui/components/ai-elements/shimmer';
import { StickToBottom } from 'use-stick-to-bottom';

import { FileAttachments, type FileAttachment } from '#/components/file-attachments';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  attachments?: FileAttachment[];
  streaming?: boolean;
  error?: string;
}

interface ChatConversationProps {
  messages: ChatMessage[];
}

export function ChatConversation({ messages }: ChatConversationProps) {
  return (
    <StickToBottom
      aria-live='polite'
      className='relative min-h-0 flex-1 overflow-y-hidden'
      initial='smooth'
      resize='smooth'
      role='log'
    >
      <StickToBottom.Content className='mx-auto flex min-h-full w-full max-w-3xl flex-col px-5 py-6 md:px-8'>
        {messages.length ? (
          messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent className='group-data-[role=user]/message:border-0 group-data-[role=user]/message:bg-muted/40'>
                {message.attachments?.length ? (
                  <FileAttachments
                    attachments={message.attachments}
                    className='mb-2'
                    variant='message'
                  />
                ) : null}
                {message.text &&
                  (message.role === 'assistant' ? (
                    <MessageResponse isAnimating={message.streaming}>
                      {message.text}
                    </MessageResponse>
                  ) : (
                    message.text
                  ))}
                {message.streaming && !message.text && (
                  <Shimmer as='span' className='text-sm'>
                    Thinking
                  </Shimmer>
                )}
                {message.error && (
                  <p className={message.text ? 'mt-2 text-danger' : 'text-danger'}>
                    {message.error}
                  </p>
                )}
              </MessageContent>
            </Message>
          ))
        ) : (
          <ConversationEmptyState className='min-h-full flex-col gap-4 pb-4'>
            <div className='flex size-11 items-center justify-center rounded-xl border bg-muted/40'>
              <img
                src='/y31-logo.svg'
                alt=''
                aria-hidden='true'
                className='h-6 w-auto opacity-70'
              />
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
        )}
      </StickToBottom.Content>
    </StickToBottom>
  );
}
