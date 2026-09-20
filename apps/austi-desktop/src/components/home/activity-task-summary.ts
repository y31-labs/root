import type { CodexActivity, CodexActivityKind, CodexActivityStatus } from '#/lib/types';

export interface ActivityDisplayItem {
  id: string;
  kind: CodexActivityKind;
  label: string;
  detail?: string;
  status: CodexActivityStatus;
}

export const activityItems = (activities: CodexActivity[]): ActivityDisplayItem[] =>
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
