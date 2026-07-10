import { createFileRoute } from '@tanstack/react-router';
import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/ui/select';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import {
  ArrowRight,
  Check,
  Clipboard,
  Clock,
  LoaderCircle,
  Minus,
  Plane,
  Plus,
  SlidersHorizontal,
  Sparkles,
  SquareTerminal,
  WandSparkles,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type {
  GeneratedControl,
  GeneratedInterface,
  GeneratedItem,
  GeneratedSection,
} from '#/lib/interface-contract';

export const Route = createFileRoute('/')({ component: HomePage });

const starterBriefs = [
  'I need a round trip to Porto in late September. I care more about total door-to-door time than the cheapest fare, need one checked bag, and want the least stressful connection.',
  'Plan a vendor renewal review where finance, legal, and engineering each need different evidence before we approve the contract.',
];

const sectionIcons = {
  decision: SlidersHorizontal,
  timeline: Clock,
  checklist: Check,
  options: Plane,
  sandbox: SquareTerminal,
} satisfies Record<GeneratedSection['kind'], typeof Plane>;

const toneClasses = {
  neutral: 'border-border bg-muted/40 text-foreground',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
} satisfies Record<GeneratedItem['tone'], string>;

const actionToneClasses = {
  neutral: 'outline',
  success: 'default',
  warning: 'secondary',
  danger: 'destructive',
} as const satisfies Record<
  GeneratedItem['tone'],
  'default' | 'outline' | 'secondary' | 'destructive'
>;

const isErrorResponse = (body: unknown): body is { error: string } =>
  typeof body === 'object' &&
  body !== null &&
  'error' in body &&
  typeof (body as { error?: unknown }).error === 'string';

export function HomePage() {
  const [brief, setBrief] = useState(starterBriefs[0] ?? '');
  const [surface, setSurface] = useState<GeneratedInterface>();
  const [status, setStatus] = useState<'idle' | 'loading'>('idle');
  const [error, setError] = useState<string>();

  const canGenerate = brief.trim().length >= 8 && status !== 'loading';

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canGenerate) return;

    setStatus('loading');
    setError(undefined);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief }),
      });
      const body = (await response.json()) as unknown;

      if (!response.ok || isErrorResponse(body)) {
        throw new Error(isErrorResponse(body) ? body.error : 'Generation failed.');
      }

      setSurface(body as GeneratedInterface);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : 'Unable to generate an interface.',
      );
    } finally {
      setStatus('idle');
    }
  };

  return (
    <main className='min-h-svh bg-background text-foreground'>
      <div className='mx-auto grid min-h-svh w-full max-w-7xl grid-cols-1 lg:grid-cols-[minmax(320px,420px)_1fr]'>
        <section className='flex min-h-0 flex-col border-b border-border lg:border-r lg:border-b-0'>
          <div className='border-b border-border p-4 md:p-6'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <h1 className='text-xl font-semibold'>Interface Lab</h1>
                <p className='text-muted-foreground text-sm'>Problem to surface</p>
              </div>
              <Badge variant='outline' className='gap-1'>
                <Sparkles className='size-3' />
                Codex
              </Badge>
            </div>
          </div>

          <form onSubmit={generate} className='flex flex-1 flex-col'>
            <div className='space-y-3 p-4 md:p-6'>
              <label className='text-sm font-medium' htmlFor='brief'>
                Problem
              </label>
              <Textarea
                id='brief'
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                className='min-h-48 resize-none'
                placeholder='I need one ticket out and back, but the best interface should handle the messy parts...'
              />
              {error ? <p className='text-danger text-sm'>{error}</p> : null}
              <Button type='submit' disabled={!canGenerate} className='w-full justify-between'>
                <span className='flex items-center gap-2'>
                  {status === 'loading' ? (
                    <LoaderCircle className='size-4 animate-spin' />
                  ) : (
                    <WandSparkles className='size-4' />
                  )}
                  Generate
                </span>
                <ArrowRight className='size-4' />
              </Button>
            </div>

            <div className='mt-auto divide-y border-t border-border'>
              {starterBriefs.map((starterBrief) => (
                <button
                  key={starterBrief}
                  type='button'
                  onClick={() => setBrief(starterBrief)}
                  className='hover:bg-muted/50 block w-full px-4 py-3 text-left text-sm transition md:px-6'
                >
                  <span className='line-clamp-2'>{starterBrief}</span>
                </button>
              ))}
            </div>
          </form>
        </section>

        <section className='min-w-0 p-4 md:p-6'>
          {surface ? (
            <GeneratedSurface key={`${surface.title}-${surface.summary}`} surface={surface} />
          ) : (
            <EmptySurface />
          )}
        </section>
      </div>
    </main>
  );
}

export function EmptySurface() {
  return (
    <div className='flex min-h-[calc(100svh-2rem)] items-center justify-center border-y border-border'>
      <div className='max-w-sm space-y-3 px-4 text-center'>
        <WandSparkles className='text-muted-foreground mx-auto size-8' />
        <h2 className='font-medium'>No surface yet</h2>
        <p className='text-muted-foreground text-sm'>The generated interface will appear here.</p>
      </div>
    </div>
  );
}

export function GeneratedSurface({ surface }: { surface: GeneratedInterface }) {
  return (
    <div className='space-y-6'>
      <header className='space-y-4 border-b border-border pb-5'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='text-muted-foreground text-sm'>{surface.intent}</p>
            <h2 className='mt-1 text-2xl font-semibold tracking-normal'>{surface.title}</h2>
          </div>
          <div className='flex shrink-0 flex-wrap gap-2'>
            <Badge variant='secondary'>{surface.domain}</Badge>
            <Badge variant={surface.backend.kind === 'codex' ? 'default' : 'outline'}>
              {surface.backend.kind}
            </Badge>
          </div>
        </div>
        <p className='text-muted-foreground max-w-3xl text-sm leading-6'>{surface.summary}</p>
      </header>

      <ControlRail controls={surface.controls} />

      <div className='grid gap-6 xl:grid-cols-[1fr_300px]'>
        <div className='space-y-6'>
          {surface.sections.map((section) => (
            <SurfaceSection key={section.id} section={section} />
          ))}
        </div>

        <aside className='space-y-6'>
          <ActionStack surface={surface} />
          <SandboxTarget surface={surface} />
        </aside>
      </div>
    </div>
  );
}

export function ControlRail({ controls }: { controls: GeneratedControl[] }) {
  const initialValues = useMemo(
    () => Object.fromEntries(controls.map((control) => [control.id, control.value])),
    [controls],
  );
  const [values, setValues] = useState<Record<string, string>>(initialValues);

  useEffect(() => setValues(initialValues), [initialValues]);

  const setControlValue = (id: string, value: string) =>
    setValues((current) => ({ ...current, [id]: value }));

  return (
    <section className='space-y-3'>
      <div className='flex items-center gap-2'>
        <SlidersHorizontal className='text-muted-foreground size-4' />
        <h3 className='text-sm font-medium'>Controls</h3>
      </div>
      <div className='grid gap-3 border-y border-border py-3 md:grid-cols-3'>
        {controls.map((control) => (
          <GeneratedControlView
            key={control.id}
            control={control}
            value={values[control.id] ?? control.value}
            onChange={(value) => setControlValue(control.id, value)}
          />
        ))}
      </div>
    </section>
  );
}

export function GeneratedControlView({
  control,
  value,
  onChange,
}: {
  control: GeneratedControl;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = control.options?.length ? control.options : [control.value];

  if (control.type === 'toggle') {
    const enabled = value === 'on';

    return (
      <div className='space-y-2'>
        <p className='text-muted-foreground text-xs'>{control.label}</p>
        <Button
          type='button'
          variant={enabled ? 'default' : 'outline'}
          className='w-full justify-between'
          onClick={() => onChange(enabled ? 'off' : 'on')}
        >
          {enabled ? 'On' : 'Off'}
          <Check className='size-4' />
        </Button>
      </div>
    );
  }

  if (control.type === 'stepper') {
    const index = Math.max(0, options.indexOf(value));
    const previous = options[Math.max(0, index - 1)] ?? value;
    const next = options[Math.min(options.length - 1, index + 1)] ?? value;

    return (
      <div className='space-y-2'>
        <p className='text-muted-foreground text-xs'>{control.label}</p>
        <div className='grid grid-cols-[2rem_1fr_2rem] items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            size='icon'
            aria-label={`Decrease ${control.label}`}
            onClick={() => onChange(previous)}
            disabled={index === 0}
          >
            <Minus className='size-4' />
          </Button>
          <div className='truncate text-center text-sm font-medium'>{value}</div>
          <Button
            type='button'
            variant='outline'
            size='icon'
            aria-label={`Increase ${control.label}`}
            onClick={() => onChange(next)}
            disabled={index === options.length - 1}
          >
            <Plus className='size-4' />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-xs'>{control.label}</p>
      <Select value={value} onValueChange={(nextValue) => nextValue && onChange(nextValue)}>
        <SelectTrigger className='w-full'>
          <SelectValue placeholder={value} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SurfaceSection({ section }: { section: GeneratedSection }) {
  const Icon = sectionIcons[section.kind];

  return (
    <section className='space-y-3'>
      <div className='flex items-center gap-2'>
        <Icon className='text-muted-foreground size-4' />
        <h3 className='text-sm font-medium'>{section.title}</h3>
      </div>
      <div className='divide-y divide-border border-y border-border'>
        {section.items.map((item) => (
          <SurfaceRow key={`${item.primary}-${item.secondary ?? ''}`} item={item} />
        ))}
      </div>
    </section>
  );
}

export function SurfaceRow({ item }: { item: GeneratedItem }) {
  return (
    <div className='grid gap-3 py-4 md:grid-cols-[minmax(150px,220px)_1fr]'>
      <div className='space-y-1'>
        <p className='font-medium'>{item.primary}</p>
        <div className='flex flex-wrap gap-1.5'>
          {item.meta.map((meta) => (
            <span
              key={meta}
              className={`inline-flex h-6 items-center rounded-md border px-2 text-xs ${toneClasses[item.tone]}`}
            >
              {meta}
            </span>
          ))}
        </div>
      </div>
      {item.secondary ? (
        <p className='text-muted-foreground text-sm leading-6'>{item.secondary}</p>
      ) : null}
    </div>
  );
}

export function ActionStack({ surface }: { surface: GeneratedInterface }) {
  return (
    <section className='space-y-3'>
      <h3 className='text-sm font-medium'>Actions</h3>
      <div className='space-y-2 border-y border-border py-3'>
        {surface.actions.map((action) => (
          <Button
            key={`${action.label}-${action.intent}`}
            type='button'
            variant={actionToneClasses[action.tone]}
            className='h-auto w-full justify-start whitespace-normal py-2 text-left'
          >
            <span>
              <span className='block'>{action.label}</span>
              <span className='text-muted-foreground block text-xs font-normal'>
                {action.intent}
              </span>
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}

export function SandboxTarget({ surface }: { surface: GeneratedInterface }) {
  const [copied, setCopied] = useState(false);

  const copyCommand = async () => {
    await navigator.clipboard.writeText(surface.sandbox.command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <section className='space-y-3'>
      <h3 className='text-sm font-medium'>Sandbox</h3>
      <div className='divide-y divide-border border-y border-border text-sm'>
        <div className='flex items-center justify-between gap-3 py-3'>
          <span className='text-muted-foreground'>Provider</span>
          <span>{surface.sandbox.provider}</span>
        </div>
        <div className='flex items-center justify-between gap-3 py-3'>
          <span className='text-muted-foreground'>Runtime</span>
          <span>{surface.sandbox.runtime}</span>
        </div>
        <div className='flex items-center justify-between gap-3 py-3'>
          <span className='text-muted-foreground'>Port</span>
          <span>{surface.sandbox.port}</span>
        </div>
        <div className='space-y-2 py-3'>
          <span className='text-muted-foreground'>Command</span>
          <div className='flex items-center gap-2'>
            <code className='bg-muted min-w-0 flex-1 truncate rounded-md px-2 py-1 text-xs'>
              {surface.sandbox.command}
            </code>
            <Button
              type='button'
              size='icon'
              variant='outline'
              aria-label='Copy sandbox command'
              onClick={() => void copyCommand()}
            >
              {copied ? <Check className='size-4' /> : <Clipboard className='size-4' />}
            </Button>
          </div>
        </div>
      </div>
      <p className='text-muted-foreground text-xs'>{surface.backend.detail}</p>
    </section>
  );
}
