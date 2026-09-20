import type { ReactNode } from 'react';

interface SettingsSectionProps {
  action?: ReactNode;
  children: ReactNode;
  title: ReactNode;
}

export function SettingsSection({ action, children, title }: SettingsSectionProps) {
  return (
    <section>
      <div className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto]'>
        <h2 className='text-base font-medium text-foreground sm:col-span-2'>{title}</h2>
        {action ? <div className='-mr-3 justify-self-end'>{action}</div> : null}
      </div>
      <div className='mt-6'>{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  description?: ReactNode;
  detail?: ReactNode;
  title: ReactNode;
  trailing?: ReactNode;
}

export function SettingsRow({ description, detail, title, trailing }: SettingsRowProps) {
  return (
    <div className='-mx-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 px-3 py-3 transition-colors hover:bg-muted/40 sm:grid-cols-[10rem_minmax(0,1fr)_auto]'>
      <h3 className='col-start-1 row-start-1 text-sm font-medium'>{title}</h3>
      <div className='col-span-2 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1'>
        {description && <p className='text-sm text-muted-foreground'>{description}</p>}
        {detail && <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>}
      </div>
      {trailing ? (
        <div className='col-start-2 row-start-1 justify-self-end text-right sm:col-start-3'>
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
