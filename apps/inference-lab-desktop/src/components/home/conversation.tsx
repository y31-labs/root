import { ConversationEmptyState } from '@workspace/ui/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@workspace/ui/components/ai-elements/message';
import { Shimmer } from '@workspace/ui/components/ai-elements/shimmer';
import { useEffect, useState } from 'react';
import { StickToBottom } from 'use-stick-to-bottom';

import { FileAttachments } from '#/components/file-attachments';
import { ApprovalRow, type ApprovalDecision } from '#/components/home/approval-row';
import { TaskSequence } from '#/components/home/task-sequence';
import type { ChatApproval, ChatMessage } from '#/lib/chat-message';
import type { ChatTranscriptPart, CodexApprovalDecision, CodexApprovalMethod } from '#/lib/types';

export type { ChatMessage } from '#/lib/chat-message';

interface ChatConversationProps {
  messages: ChatMessage[];
  onApprovalDecision?: (
    requestId: string | number,
    method: CodexApprovalMethod,
    decision: CodexApprovalDecision,
  ) => void;
}

export function ChatConversation({ messages, onApprovalDecision }: ChatConversationProps) {
  return (
    <StickToBottom
      aria-live='polite'
      className='relative min-h-0 flex-1 overflow-y-hidden'
      initial='instant'
      resize='instant'
      role='log'
    >
      <StickToBottom.Content className='mx-auto flex min-h-full w-full max-w-3xl flex-col px-5 py-6 md:px-8'>
        {messages.length ? (
          messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent className='group-[.is-user]:border-0 group-[.is-user]:bg-muted/40'>
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
                    <Shimmer as='span' className='text-sm'>
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

type MessageTranscriptPart = Extract<ChatTranscriptPart, { type: 'message' }>;
type TaskTranscriptPart = Exclude<ChatTranscriptPart, MessageTranscriptPart>;
type TranscriptSegment =
  | { type: 'message'; part: MessageTranscriptPart }
  | { type: 'tasks'; id: string; parts: TaskTranscriptPart[] };

function MessageTranscript({
  parts,
  streaming,
}: {
  parts: ChatTranscriptPart[];
  streaming: boolean;
}) {
  const segments = transcriptSegments(parts);

  return segments.map((segment, index) => {
    const active = streaming && index === segments.length - 1;
    if (segment.type === 'message') {
      return (
        <MessageResponse className='h-auto' isAnimating={active} key={segment.part.id}>
          {segment.part.text}
        </MessageResponse>
      );
    }
    return <TaskSequence active={active} key={segment.id} parts={segment.parts} />;
  });
}

const transcriptSegments = (parts: ChatTranscriptPart[]): TranscriptSegment[] => {
  const segments: TranscriptSegment[] = [];

  for (const part of parts) {
    if (part.type === 'message') {
      if (part.text.trim()) segments.push({ type: 'message', part });
      continue;
    }

    const last = segments.at(-1);
    if (last?.type === 'tasks') {
      last.parts.push(part);
      continue;
    }
    segments.push({ type: 'tasks', id: `tasks-${part.id}`, parts: [part] });
  }

  return segments;
};

const approvalTitle = (approval: ChatApproval) => {
  if (approval.status !== 'resolved') return approval.title;
  if (approval.decision === 'accept') return 'Allowed once';
  if (approval.decision === 'acceptForSession') return 'Allowed for session';
  return 'Denied';
};

function TurnDuration({
  completedAtMs,
  startedAtMs,
  streaming,
}: {
  completedAtMs?: number;
  startedAtMs: number;
  streaming: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!streaming) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [streaming]);

  const elapsed = formatElapsedTime(Math.max(0, (completedAtMs ?? now) - startedAtMs));

  return (
    <p className='mb-4 border-b pb-3 text-xs tabular-nums text-muted-foreground'>
      {streaming ? 'Working' : 'Worked'} for {elapsed}
    </p>
  );
}

const formatElapsedTime = (durationMs: number) => {
  const totalSeconds = Math.floor(durationMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};
