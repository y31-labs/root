import type { MaintenanceCase } from '#/features/maintenance/data';

type TimelineEntry = {
  id: string;
  time: string;
  title: string;
  kind: NonNullable<MaintenanceCase['timeline'][number]['kind']> | 'activity' | 'message';
  body?: string;
};

export const getCaseTimeline = (item: MaintenanceCase): TimelineEntry[] =>
  [
    ...item.timeline.map(
      (event, index): TimelineEntry => ({
        ...event,
        id: `event-${index}`,
        kind: event.kind ?? 'activity',
        title:
          event.kind === 'report'
            ? `${item.tenant} · Tenant report`
            : event.kind === 'quote'
              ? item.status === 'Needs approval'
                ? 'Quote awaiting approval'
                : 'Quote received'
              : event.title,
      }),
    ),
    ...item.messages.map(
      (message, index): TimelineEntry => ({
        id: `message-${index}`,
        kind: 'message',
        title: message.sender,
        time: message.time,
        body: message.body,
      }),
    ),
  ].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));

export const formatEventTime = (time: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Vilnius',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
