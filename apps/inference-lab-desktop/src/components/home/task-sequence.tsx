import { Shimmer } from '@workspace/ui/components/ai-elements/shimmer';
import { Task, TaskTrigger } from '@workspace/ui/components/ai-elements/task';
import { ChevronDown, ListTodo } from 'lucide-react';
import { useStickToBottomContext } from 'use-stick-to-bottom';

import {
  ActivityTask,
  activityTaskCompletionPhrases,
  activityTaskProgressLabel,
} from '#/components/home/activity-task';
import { AnimatedTaskContent } from '#/components/home/animated-task-content';
import { ReasoningTask } from '#/components/home/reasoning-task';
import type { ChatTranscriptPart } from '#/lib/types';

type TaskTranscriptPart = Exclude<ChatTranscriptPart, { type: 'message' }>;

interface TaskSequenceProps {
  active?: boolean;
  parts: TaskTranscriptPart[];
}

export function TaskSequence({ active = false, parts }: TaskSequenceProps) {
  const { stopScroll } = useStickToBottomContext();
  const title = active ? taskSequenceProgressTitle(parts) : taskSequenceCompletionTitle(parts);

  return (
    <Task
      className='my-3'
      defaultOpen={false}
      onOpenChange={() => {
        if (!active) stopScroll();
      }}
    >
      <TaskTrigger
        className='inline-flex max-w-full rounded-sm py-0.5 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
        title={title}
      >
        <span className='flex max-w-full min-w-0 items-center gap-2 text-sm text-muted-foreground'>
          <ListTodo aria-hidden='true' className='size-4 shrink-0' />
          {active ? (
            <Shimmer as='span' className='min-w-0 truncate text-sm'>
              {title}
            </Shimmer>
          ) : (
            <span className='min-w-0 truncate'>{title}</span>
          )}
          <ChevronDown
            aria-hidden='true'
            className='size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180'
          />
        </span>
      </TaskTrigger>
      <AnimatedTaskContent
        aria-label='Task sequence'
        className='[&>div]:mt-2 [&>div]:space-y-2 [&>div]:border-0 [&>div]:pl-6'
      >
        {parts.map((part) =>
          part.type === 'reasoning' ? (
            <ReasoningTask active={active} key={part.id} summaries={part.summaries} />
          ) : (
            <ActivityTask active={active} activities={part.activities} key={part.id} />
          ),
        )}
      </AnimatedTaskContent>
    </Task>
  );
}

const taskSequenceProgressTitle = (parts: TaskTranscriptPart[]) => {
  const lastPart = parts.at(-1);
  if (!lastPart || lastPart.type === 'reasoning') return 'Thinking';
  return activityTaskProgressLabel(lastPart.activities);
};

const taskSequenceCompletionTitle = (parts: TaskTranscriptPart[]) => {
  const phrases = activityTaskCompletionPhrases(
    parts.flatMap((part) => (part.type === 'activity' ? part.activities : [])),
  );
  if (!phrases.length) return 'Thought through the request';
  return phrases.map((phrase, index) => (index === 0 ? phrase : lowercaseFirst(phrase))).join(', ');
};

const lowercaseFirst = (value: string) =>
  value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value;
