import { Textarea } from '@workspace/ui/components/ui/textarea';
import { FileImage, MessageSquare } from 'lucide-react';
import type { ReactNode } from 'react';

import { Field, PreviewDialog, Section } from '#/features/maintenance/components';
import { formatEuro, getContractor, type MaintenanceCase } from '#/features/maintenance/data';
import { formatEventTime, getCaseTimeline } from '#/features/maintenance/timeline';

interface CaseTimelineProps {
  item: MaintenanceCase;
  contractorAction: ReactNode;
}

export function CaseTimeline({ item, contractorAction }: CaseTimelineProps) {
  const contractor = getContractor(item.contractorId);
  const quote = item.quote;
  const pendingQuote = item.status === 'Needs approval';
  return (
    <Section
      title='Timeline'
      action={
        <PreviewDialog
          title='Message tenant'
          trigger={
            <>
              <MessageSquare />
              Message tenant
            </>
          }
          confirmLabel='Send'
        >
          <div className='text-sm'>{item.tenant}</div>
          <Field id='tenant-message' label='Message'>
            <Textarea id='tenant-message' rows={5} />
          </Field>
        </PreviewDialog>
      }
    >
      <ol className='ml-1 border-l'>
        {getCaseTimeline(item).map((event) => {
          const routine = event.kind === 'activity';
          const actionable =
            (event.kind === 'quote' && pendingQuote) ||
            (event.kind === 'escalation' && item.status === 'Escalated') ||
            (event.kind === 'assignment' && item.status === 'Unassigned');
          return (
            <li key={event.id} className={'relative pl-5 last:pb-0 ' + (routine ? 'pb-4' : 'pb-7')}>
              <span
                aria-hidden='true'
                className={
                  'absolute top-1.5 -left-1 size-2 rounded-full ring-4 ring-background ' +
                  (actionable ? 'bg-primary' : 'bg-border')
                }
              />
              <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
                <h3
                  className={
                    'text-sm ' +
                    (actionable
                      ? 'font-medium text-primary'
                      : routine
                        ? 'text-muted-foreground'
                        : 'text-foreground')
                  }
                >
                  {event.title}
                </h3>
                <time dateTime={event.time} className='text-xs text-muted-foreground'>
                  {formatEventTime(event.time)}
                </time>
              </div>
              {event.kind === 'report' && (
                <div className='mt-2 space-y-3'>
                  <p className='max-w-prose text-sm leading-6'>{item.report}</p>
                  {!!item.attachments.length && (
                    <ul className='flex flex-wrap gap-2' aria-label='Attachments'>
                      {item.attachments.map((attachment) => (
                        <li
                          key={attachment.name}
                          className='flex max-w-full items-center gap-3 rounded-md border px-3 py-2.5'
                        >
                          <FileImage
                            aria-hidden='true'
                            className='size-5 shrink-0 text-muted-foreground'
                          />
                          <div className='min-w-0'>
                            <div className='truncate text-xs font-medium'>{attachment.name}</div>
                            <div className='mt-0.5 text-xs text-muted-foreground'>
                              {attachment.size}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {event.kind === 'message' && (
                <p className='mt-2 max-w-prose text-sm leading-6'>{event.body}</p>
              )}
              {['assessment', 'escalation', 'assignment'].includes(event.kind) && (
                <div className='mt-2 max-w-prose space-y-1'>
                  <p className='text-xs text-muted-foreground'>Austi assessment</p>
                  <p className='text-sm leading-6'>{item.assessment}</p>
                </div>
              )}
              {event.kind === 'quote' && quote && (
                <div className='mt-3 space-y-3'>
                  <p className='text-xs text-muted-foreground'>
                    {contractor?.company} · {quote.reference}
                  </p>
                  <div className='text-base font-medium tabular-nums'>
                    {formatEuro(quote.amount)}
                  </div>
                  <p className='text-sm text-muted-foreground'>{quote.work}</p>
                  {pendingQuote && (
                    <div className='flex flex-wrap items-center gap-2'>
                      <PreviewDialog
                        title='Approve quote'
                        trigger={`Approve ${formatEuro(quote.amount)} quote`}
                        triggerVariant='default'
                        confirmLabel='Approve'
                      >
                        <div className='flex justify-between text-sm'>
                          <span>{contractor?.company}</span>
                          <span className='font-bold'>{formatEuro(quote.amount)}</span>
                        </div>
                      </PreviewDialog>
                      <PreviewDialog
                        title='Message contractor'
                        trigger='Message contractor'
                        confirmLabel='Send'
                      >
                        <div className='text-sm'>{contractor?.company}</div>
                        <Field id='contractor-message' label='Message'>
                          <Textarea
                            id='contractor-message'
                            rows={5}
                            placeholder='Ask a question or request a revised quote…'
                          />
                        </Field>
                      </PreviewDialog>
                      {contractorAction}
                    </div>
                  )}
                </div>
              )}
              {event.kind === 'escalation' && actionable && (
                <div className='mt-3'>
                  <PreviewDialog
                    title='Review emergency'
                    trigger='Review emergency'
                    triggerVariant='default'
                    confirmLabel='Save review'
                  >
                    <p className='text-sm leading-6'>{item.assessment}</p>
                    <Field id='emergency-review' label='Next steps'>
                      <Textarea id='emergency-review' rows={4} />
                    </Field>
                  </PreviewDialog>
                </div>
              )}
              {event.kind === 'assignment' && actionable && (
                <div className='mt-3'>{contractorAction}</div>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
