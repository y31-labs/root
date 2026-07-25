import { Task, TaskItem, TaskTrigger } from '@workspace/ui/components/ai-elements/task';
import {
  BookOpen,
  Bot,
  ChevronDown,
  CircleAlert,
  FilePenLine,
  Globe2,
  ImageIcon,
  ListTodo,
  Search,
  SquareTerminal,
  Timer,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useStickToBottomContext } from 'use-stick-to-bottom';

import { AnimatedTaskContent } from '#/components/home/animated-task-content';
import type { CodexActivity, CodexActivityKind, CodexActivityStatus } from '#/lib/types';

interface ActivityTaskProps {
  activities: CodexActivity[];
  active?: boolean;
}

export function ActivityTask({ activities, active = false }: ActivityTaskProps) {
  const { stopScroll } = useStickToBottomContext();
  const items = activityItems(activities);
  const handleDisclosureChange = () => {
    if (!active) stopScroll();
  };

  return (
    <div aria-label='Agent activity' className='space-y-1' role='list'>
      {items.map((activity) => (
        <ActivityItem
          activity={activity}
          key={activity.id}
          onDisclosureChange={handleDisclosureChange}
        />
      ))}
    </div>
  );
}

function ActivityItem({
  activity,
  onDisclosureChange,
}: {
  activity: ActivityDisplayItem;
  onDisclosureChange: () => void;
}) {
  return (
    <TaskItem className='min-w-0' role='listitem'>
      {activity.detail ? (
        <Task defaultOpen={false} onOpenChange={onDisclosureChange}>
          <TaskTrigger
            aria-label={activity.label}
            className='group/activity w-full rounded-sm text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
            title={activity.label}
          >
            <span className='flex min-w-0 items-center gap-2 py-0.5'>
              <ActivityRow activity={activity} disclosure />
            </span>
          </TaskTrigger>
          <AnimatedTaskContent
            aria-label={`${activity.label} details`}
            className='[&>div]:mt-1 [&>div]:border-0 [&>div]:pl-6'
          >
            <ActivityDetail activity={activity} />
          </AnimatedTaskContent>
        </Task>
      ) : (
        <div className='flex min-w-0 items-center gap-2 py-0.5'>
          <ActivityRow activity={activity} />
        </div>
      )}
    </TaskItem>
  );
}

function ActivityRow({
  activity,
  disclosure = false,
}: {
  activity: ActivityDisplayItem;
  disclosure?: boolean;
}) {
  return (
    <>
      <ActivityIcon activity={activity} />
      <span className='min-w-0 flex-1 truncate'>{activity.label}</span>
      {disclosure ? (
        <ChevronDown
          aria-hidden='true'
          className='size-3.5 shrink-0 opacity-0 transition-all group-hover/activity:opacity-100 group-data-[panel-open]/activity:rotate-180 group-data-[panel-open]/activity:opacity-100'
        />
      ) : null}
    </>
  );
}

function ActivityDetail({ activity }: { activity: ActivityDisplayItem }) {
  if (activity.kind !== 'file') {
    return (
      <pre className='max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground'>
        {activity.detail}
      </pre>
    );
  }

  return (
    <pre className='max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground'>
      {activity.detail?.split('\n').map((line, index) => (
        <span className={diffLineClassName(line)} key={`${index}-${line}`}>
          {line}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}

function ActivityIcon({ activity }: { activity: ActivityDisplayItem }) {
  return <ActivityStatusIcon kind={activity.kind} status={activity.status} />;
}

function ActivityStatusIcon({
  announceStatus = true,
  kind,
  status,
}: {
  announceStatus?: boolean;
  kind: CodexActivityKind;
  status: CodexActivityStatus;
}) {
  const label = activityStatusLabel(status);
  const icon = status === 'failed' ? <CircleAlert /> : activityIcons[kind];

  return (
    <span
      aria-hidden={announceStatus ? undefined : true}
      aria-label={announceStatus ? label : undefined}
      className={
        status === 'failed'
          ? 'shrink-0 text-danger [&>svg]:size-4'
          : status === 'running'
            ? 'shrink-0 animate-pulse [&>svg]:size-4'
            : 'shrink-0 [&>svg]:size-4'
      }
    >
      {icon}
    </span>
  );
}

const activityIcons: Record<CodexActivityKind, ReactNode> = {
  agent: <Bot />,
  command: <SquareTerminal />,
  error: <CircleAlert />,
  file: <FilePenLine />,
  image: <ImageIcon />,
  plan: <ListTodo />,
  read: <BookOpen />,
  search: <Search />,
  tool: <Wrench />,
  wait: <Timer />,
  web: <Globe2 />,
};

interface ActivityDisplayItem {
  id: string;
  kind: CodexActivityKind;
  label: string;
  detail?: string;
  status: CodexActivityStatus;
}

const activityItems = (activities: CodexActivity[]): ActivityDisplayItem[] =>
  activities.flatMap((activity) =>
    activity.items?.length
      ? activity.items.map((item) => ({
          ...item,
          kind: activity.kind,
          status: activity.status,
        }))
      : [activity],
  );

export const activityTaskProgressLabel = (activities: CodexActivity[]) => {
  const items = activityItems(activities);
  let current = items.at(-1);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.status !== 'running') continue;
    current = items[index];
    break;
  }
  if (!current) return 'Working';
  return current.status === 'failed' ? `${current.label} — failed` : current.label;
};

export const activityTaskCompletionPhrases = (activities: CodexActivity[]) => {
  const completedKinds = new Map<CodexActivityKind, ActivityDisplayItem[]>();
  const running: string[] = [];
  const failed: string[] = [];

  for (const activity of activityItems(activities)) {
    if (activity.status === 'running') {
      running.push(activity.label);
      continue;
    }
    if (activity.status === 'failed') {
      failed.push(`${activity.label} — failed`);
      continue;
    }
    completedKinds.set(activity.kind, [...(completedKinds.get(activity.kind) ?? []), activity]);
  }

  return [
    ...[...completedKinds].map(([kind, items]) => completedActivityLabel(kind, items)),
    ...running,
    ...failed,
  ];
};

const completedActivityLabel = (kind: CodexActivityKind, activities: ActivityDisplayItem[]) => {
  const count = activities.length;
  const plural = count > 1;
  switch (kind) {
    case 'agent':
      return plural ? `Worked with ${count} agents` : 'Worked with an agent';
    case 'command':
      return plural ? `Ran ${count} commands` : 'Ran a command';
    case 'error':
      return plural ? `Encountered ${count} errors` : 'Encountered an error';
    case 'file':
      return plural ? 'Edited files' : 'Edited a file';
    case 'image':
      if (activities.every((activity) => activity.label.startsWith('Viewed '))) {
        return plural ? `Viewed ${count} images` : 'Viewed an image';
      }
      if (activities.every((activity) => activity.label.startsWith('Generated '))) {
        return plural ? `Generated ${count} images` : 'Generated an image';
      }
      return plural ? `Worked with ${count} images` : 'Worked with an image';
    case 'plan':
      return plural ? `Updated the plan ${count} times` : 'Updated the plan';
    case 'read':
      return plural ? 'Read files' : 'Read a file';
    case 'search':
      return plural ? `Searched files ${count} times` : 'Searched files';
    case 'tool':
      return plural ? `Loaded ${count} tools` : 'Loaded a tool';
    case 'wait':
      return plural ? `Waited ${count} times` : 'Waited';
    case 'web':
      return plural ? `Searched the web ${count} times` : 'Searched the web';
  }
};

const activityStatusLabel = (status: CodexActivity['status']) => {
  if (status === 'succeeded') return 'Succeeded';
  if (status === 'failed') return 'Failed';
  return 'Running';
};

const diffLineClassName = (line: string) => {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'text-success';
  if (line.startsWith('-') && !line.startsWith('---')) return 'text-danger';
  return undefined;
};
