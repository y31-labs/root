import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from '@workspace/ui/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@workspace/ui/components/ai-elements/message';
import { Shimmer } from '@workspace/ui/components/ai-elements/shimmer';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
  error?: string;
}

interface ChatConversationProps {
  messages: ChatMessage[];
}

export function ChatConversation({ messages }: ChatConversationProps) {
  return (
    <Conversation aria-live='polite'>
      {messages.length ? (
        <ConversationContent>
          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent className='group-data-[role=user]/message:border-0 group-data-[role=user]/message:bg-muted/40'>
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
          ))}
        </ConversationContent>
      ) : (
        <ConversationEmptyState className='min-h-full flex-col gap-4 pb-4'>
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
      )}
    </Conversation>
  );
}
