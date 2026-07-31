import { ConversationEmptyState } from '@workspace/ui/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@workspace/ui/components/ai-elements/message';
import { Shimmer } from '@workspace/ui/components/ai-elements/shimmer';
import { StickToBottom } from 'use-stick-to-bottom';

import { FileAttachments } from '#/components/file-attachments';
import { ApprovalRow, type ApprovalDecision } from '#/components/home/approval-row';
import { MessageTranscript } from '#/components/home/message-transcript';
import { TurnDuration } from '#/components/home/turn-duration';
import type { ChatApproval, ChatMessage } from '#/lib/chat-message';
import type { CodexApprovalDecision, CodexApprovalMethod } from '#/lib/types';

export type { ChatMessage } from '#/lib/chat-message';

interface ChatConversationProps {
  loading?: boolean;
  messages: ChatMessage[];
  onApprovalDecision?: (
    requestId: string | number,
    method: CodexApprovalMethod,
    decision: CodexApprovalDecision,
  ) => void;
}

export function ChatConversation({
  loading = false,
  messages,
  onApprovalDecision,
}: ChatConversationProps) {
  return (
    <StickToBottom
      aria-live='polite'
      className='relative min-h-0 flex-1 overflow-y-hidden'
      initial='instant'
      resize='instant'
      role='log'
    >
      <StickToBottom.Content className='mx-auto flex min-h-full w-full max-w-3xl flex-col px-5 py-6 md:px-8'>
        {loading ? null : messages.length ? (
          messages.map((message) => (
            <Message
              className={message.role === 'assistant' ? 'mt-6 max-w-full' : 'mt-6'}
              from={message.role}
              key={message.id}
            >
              <MessageContent className='group-[.is-assistant]:w-full group-[.is-user]:border-0 group-[.is-user]:bg-muted/40'>
                {message.role === 'assistant' && message.startedAtMs !== undefined ? (
                  <TurnDuration
                    completedAtMs={message.completedAtMs}
                    startedAtMs={message.startedAtMs}
                    streaming={message.streaming === true}
                  />
                ) : null}
                {message.attachments?.length ? (
                  <FileAttachments
                    attachments={message.attachments}
                    className='mb-2'
                    variant='message'
                  />
                ) : null}
                {message.role === 'assistant' && message.parts?.length ? (
                  <MessageTranscript parts={message.parts} streaming={message.streaming === true} />
                ) : (
                  message.text &&
                  (message.role === 'assistant' ? (
                    <MessageResponse className='h-auto' isAnimating={message.streaming}>
                      {message.text}
                    </MessageResponse>
                  ) : (
                    message.text
                  ))
                )}
                {message.streaming &&
                  !message.text &&
                  !message.parts?.length &&
                  !message.approvals?.length && (
                    <Shimmer as='span' className='text-sm' duration={3}>
                      Thinking
                    </Shimmer>
                  )}
                {message.error && (
                  <p className={message.text ? 'mt-2 text-danger' : 'text-danger'}>
                    {message.error}
                  </p>
                )}
                {message.approvals?.map((approval) => (
                  <div key={`${approval.method}-${approval.requestId}`}>
                    <ApprovalRow
                      detail={approval.detail}
                      disabled={approval.status !== 'pending'}
                      title={approvalTitle(approval)}
                      onDecision={(decision: ApprovalDecision) =>
                        onApprovalDecision?.(approval.requestId, approval.method, decision)
                      }
                    />
                    {approval.error ? (
                      <p className='mb-2 text-sm text-danger' role='alert'>
                        {approval.error}
                      </p>
                    ) : null}
                  </div>
                ))}
              </MessageContent>
            </Message>
          ))
        ) : (
          <ConversationEmptyState className='min-h-full flex-col gap-4 pb-4'>
            <div className='flex size-11 items-center justify-center rounded-xl border bg-muted/40'>
              <img
                src='/austi-logo.svg'
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

const approvalTitle = (approval: ChatApproval) => {
  if (approval.status === 'expired') return `${approval.title} — expired`;
  if (approval.status !== 'resolved') return approval.title;
  if (approval.decision === 'accept') return 'Allowed once';
  if (approval.decision === 'acceptForSession') return 'Allowed for session';
  return 'Denied';
};
