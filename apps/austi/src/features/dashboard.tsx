import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@workspace/ui/components/ui/button';
import { ArrowRight } from 'lucide-react';

import { Page, Section, StatusBadge, Urgency } from '#/features/maintenance/components';
import { cases, checkIfNeedsAttention, getContractor } from '#/features/maintenance/data';

export function Dashboard() {
  const openCases = cases.filter((item) => item.status !== 'Resolved');
  const attentionCases = cases.filter(checkIfNeedsAttention);
  const scheduledCases = cases.filter((item) => item.status === 'Scheduled');
  const metrics = [
    { label: 'Open cases', value: openCases.length },
    { label: 'Needs attention', value: attentionCases.length },
    { label: 'Scheduled visits', value: scheduledCases.length },
    { label: 'Resolved cases', value: cases.length - openCases.length },
  ];

  return (
    <Page title='Dashboard'>
      <dl className='grid grid-cols-2 gap-x-6 gap-y-6 py-6 sm:grid-cols-4'>
        {metrics.map(({ label, value }) => (
          <div key={label} className='space-y-2'>
            <dt className='text-xs text-muted-foreground'>{label}</dt>
            <dd className='text-3xl font-bold tracking-tight tabular-nums'>{value}</dd>
          </div>
        ))}
      </dl>
      <div className='grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10'>
        <Section
          title='Needs attention'
          action={
            <Link to='/maintenance' className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Open maintenance
              <ArrowRight aria-hidden='true' />
            </Link>
          }
        >
          {attentionCases.length ? (
            <ul className='divide-y'>
              {attentionCases.map((item) => (
                <li key={item.id}>
                  <Link
                    to='/maintenance/$caseId'
                    params={{ caseId: item.id }}
                    className='-mx-3 block space-y-3 rounded-md px-3 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring'
                  >
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='text-sm font-medium'>{item.title}</span>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className='text-xs text-muted-foreground'>
                      {item.property} · Unit {item.unit} · {item.id}
                    </p>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <Urgency value={item.urgency} />
                      <span className='inline-flex items-center gap-2 text-xs font-medium'>
                        {item.nextAction}
                        <ArrowRight aria-hidden='true' className='size-3.5' />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className='py-6 text-sm text-muted-foreground'>No cases need your attention.</p>
          )}
        </Section>
        <aside className='min-w-0 space-y-7 border-t pt-6 lg:border-t-0 lg:pt-0 lg:pl-7'>
          <Section title='Scheduled visits'>
            {scheduledCases.length ? (
              <ul className='space-y-5'>
                {scheduledCases.map((item) => (
                  <li key={item.id} className='space-y-2 text-sm'>
                    <p className='text-xs text-muted-foreground'>
                      {item.appointment ?? 'Time to be confirmed'}
                    </p>
                    <Link
                      to='/maintenance/$caseId'
                      params={{ caseId: item.id }}
                      className='font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring'
                    >
                      {item.title}
                    </Link>
                    <p className='text-xs text-muted-foreground'>
                      {item.property} · Unit {item.unit}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {getContractor(item.contractorId)?.company ?? 'Unassigned'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className='text-sm text-muted-foreground'>No visits scheduled.</p>
            )}
          </Section>
          <div className='border-t pt-5'>
            <Link
              to='/contractors'
              className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-3' })}
            >
              Manage contractors
              <ArrowRight aria-hidden='true' />
            </Link>
          </div>
        </aside>
      </div>
    </Page>
  );
}
