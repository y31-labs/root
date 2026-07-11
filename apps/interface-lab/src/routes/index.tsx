import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/ui/dialog';
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
  CircleHelp,
  Clock,
  Keyboard,
  LoaderCircle,
  MessageCircle,
  Minus,
  Plane,
  Plus,
  SlidersHorizontal,
  SquareTerminal,
  WandSparkles,
} from 'lucide-react';
import { type SubmitEvent, useEffect, useMemo, useState } from 'react';

import { AnimatedAccordion, type AnimatedAccordionItem } from '#/components/animated-accordion';
import { Shader14Background } from '#/components/shader14-background';
import { APP_NAME } from '#/lib/app-config';
import type {
  GeneratedControl,
  GeneratedInterface,
  GeneratedItem,
  GeneratedSection,
} from '#/lib/interface-contract';
import { runViewTransition } from '#/lib/view-transition';

export const Route = createFileRoute('/')({ component: HomePage });

export type WorkspaceMessage = {
  label: 'You' | 'Focus';
  message: string;
};

const sectionIcons = {
  decision: SlidersHorizontal,
  timeline: Clock,
  checklist: Check,
  options: Plane,
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

const quickStarts = [
  {
    label: 'Plan a trip',
    prompt:
      'Plan a round trip to Porto in late September with one checked bag and the least stressful connection.',
    icon: Plane,
  },
  {
    label: 'Make a decision',
    prompt:
      'Help me compare three vendors for a small team. I care about cost, setup time, and long-term flexibility.',
    icon: SlidersHorizontal,
  },
  {
    label: 'Shape a workflow',
    prompt:
      'Create a review workflow where finance, legal, and engineering each see the evidence they need before approval.',
    icon: SquareTerminal,
  },
] as const;

export function HomePage() {
  const [brief, setBrief] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const navigate = useNavigate();

  const canGenerate = brief.trim().length >= 8;

  const updateBrief = (nextBrief: string) => {
    setBrief(nextBrief);
  };

  const selectQuickStart = (nextBrief: string) => {
    setBrief(nextBrief);

    window.requestAnimationFrame(() => {
      document.getElementById('front-prompt')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      document.getElementById('brief')?.focus();
    });
  };

  const openSurface = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formBrief = new FormData(event.currentTarget).get('brief');
    const submittedBrief = typeof formBrief === 'string' ? formBrief.trim() : brief.trim();
    if (submittedBrief.length < 8) return;

    setBrief(submittedBrief);

    runViewTransition(() =>
      navigate({
        to: '/workspace',
        search: { brief: submittedBrief },
      }),
    );
  };

  return (
    <main className='relative min-h-dvh overflow-x-hidden bg-background text-foreground'>
      <LandingBackground />
      <AppNavbar onLogin={() => setLoginOpen(true)} />
      <div className='relative z-10'>
        <FrontDoor
          brief={brief}
          canGenerate={canGenerate}
          onBriefChange={updateBrief}
          onQuickStart={selectQuickStart}
          onSubmit={openSurface}
        />
        <HowItWorks />
        <FaqSection />
        <LandingFooter />
      </div>
      <LoginPlaceholder open={loginOpen} onOpenChange={setLoginOpen} />
    </main>
  );
}

function LandingBackground() {
  return (
    <div aria-hidden='true' className='pointer-events-none fixed inset-0 z-0'>
      <Shader14Background className='opacity-30' />
      <div className='absolute inset-0 bg-background/70' />
      <div className='absolute inset-0 bg-linear-to-b from-background/80 via-transparent to-background/90' />
    </div>
  );
}

function AppNavbar({ onLogin }: { onLogin: () => void }) {
  return (
    <header className='pointer-events-none sticky top-0 z-30 border-b border-border/60 bg-background/70 px-4 py-4 backdrop-blur-xl md:px-6'>
      <nav className='mx-auto flex w-full max-w-7xl items-center justify-between gap-4'>
        <a
          href='/'
          className='pointer-events-auto inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground'
        >
          <img src='/code-logo.svg' alt='' aria-hidden='true' className='size-4 invert' />
          <span>{APP_NAME}</span>
        </a>
        <Button
          type='button'
          variant='ghost'
          className='pointer-events-auto text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          aria-label='Log in'
          onClick={onLogin}
        >
          Log in
        </Button>
      </nav>
    </header>
  );
}

function LoginPlaceholder({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='border border-border bg-background p-6 shadow-2xl'>
        <DialogHeader className='gap-3 pr-8'>
          <span className='text-success text-xs font-medium uppercase tracking-[0.18em]'>
            Coming soon
          </span>
          <DialogTitle className='text-xl'>Login is on its way.</DialogTitle>
          <DialogDescription className='leading-6'>
            Accounts are not open yet. This will become the place to get notified when login
            launches.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

function FrontDoor({
  brief,
  canGenerate,
  onBriefChange,
  onQuickStart,
  onSubmit,
}: {
  brief: string;
  canGenerate: boolean;
  onBriefChange: (brief: string) => void;
  onQuickStart: (brief: string) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}) {
  return (
    <section
      className='mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-6xl flex-col justify-between px-4 pb-8 pt-16 md:px-6 md:pb-10 md:pt-20'
      data-testid='front-door'
    >
      <div className='mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-6 text-center'>
        <div className='space-y-4'>
          <p className='text-muted-foreground text-xs font-medium uppercase tracking-[0.2em]'>
            A visual interface for whatever is next
          </p>
          <h1 className='text-balance text-4xl font-semibold tracking-[-0.04em] md:text-7xl'>
            Describe the work. Get the surface.
          </h1>
          <h2 className='text-muted-foreground mx-auto max-w-2xl text-base font-normal leading-7 md:text-lg'>
            Turn a messy thought, decision, or workflow into a focused interface you can use.
          </h2>
        </div>

        <div
          id='front-prompt'
          className='w-full max-w-3xl [view-transition-name:interface-chat]'
          data-testid='front-prompt'
        >
          <PromptForm
            brief={brief}
            canGenerate={canGenerate}
            onBriefChange={onBriefChange}
            onSubmit={onSubmit}
            variant='hero'
          />
          <div className='mt-5 rounded-2xl border border-border/80 bg-background/75 p-2 text-left shadow-lg backdrop-blur-sm'>
            <p className='px-2 pb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground'>
              Start from an example
            </p>
            <div className='grid grid-cols-3 gap-2'>
              {quickStarts.map((quickStart) => {
                const Icon = quickStart.icon;

                return (
                  <button
                    key={quickStart.label}
                    type='button'
                    className='flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/45 px-2 text-center text-xs font-medium text-foreground transition-colors hover:border-foreground/30 hover:bg-muted/80'
                    onClick={() => onQuickStart(quickStart.prompt)}
                  >
                    <Icon className='size-3.5 shrink-0 text-muted-foreground' />
                    <span>{quickStart.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className='flex items-center justify-center gap-2 pt-8 text-xs text-muted-foreground'>
        <span className='inline-block size-1.5 rounded-full bg-success' />
        <span>Start with a prompt, or choose an example above</span>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className='mx-auto max-w-6xl px-4 py-24 md:px-6 md:py-32'>
      <div className='grid gap-10 md:grid-cols-[0.7fr_1.3fr] md:gap-20'>
        <div className='space-y-3'>
          <p className='text-muted-foreground text-xs font-medium uppercase tracking-[0.18em]'>
            The idea
          </p>
          <h2 className='text-3xl font-semibold tracking-tight md:text-4xl'>
            Less app hunting. More getting somewhere.
          </h2>
        </div>
        <div className='grid divide-y divide-border border-y border-border'>
          <LandingPrinciple
            index='01'
            title='Say what is messy.'
            detail='Bring the half-formed brief, the competing priorities, or the workflow that lives in five tabs.'
          />
          <LandingPrinciple
            index='02'
            title='Get the right shape.'
            detail='y31 assembles decisions, controls, context, and actions into one focused surface.'
          />
          <LandingPrinciple
            index='03'
            title='Keep moving.'
            detail='Use the surface, adjust the inputs, and take the next action without translating your intent into app language.'
          />
        </div>
      </div>
    </section>
  );
}

function LandingPrinciple({
  index,
  title,
  detail,
}: {
  index: string;
  title: string;
  detail: string;
}) {
  return (
    <div className='grid gap-3 py-5 sm:grid-cols-[3rem_1fr] sm:gap-6'>
      <span className='font-mono text-xs text-muted-foreground'>{index}</span>
      <div className='space-y-1'>
        <h3 className='font-medium'>{title}</h3>
        <p className='text-muted-foreground max-w-xl text-sm leading-6'>{detail}</p>
      </div>
    </div>
  );
}

function FaqSection() {
  const questions: AnimatedAccordionItem[] = [
    {
      value: 'what-is-y31',
      title: 'What is y31?',
      content:
        'y31 is a prompt-first interface layer. You describe the work and it generates a focused surface around the decisions and actions that matter.',
      icon: CircleHelp,
    },
    {
      value: 'is-it-a-chatbot',
      title: 'Is it another chatbot?',
      content:
        'No. The prompt is the entry point, but the output is an interface: controls, options, timelines, actions, and a place to continue.',
      icon: MessageCircle,
    },
    {
      value: 'what-to-type',
      title: 'What should I type?',
      content:
        'Start with the outcome, the constraints, and anything that makes the task feel messy. A rough brief is enough.',
      icon: Keyboard,
    },
    {
      value: 'after-submit',
      title: 'What happens after I submit?',
      content:
        'Your prompt opens a dedicated workspace where y31 shapes the surface and keeps the conversation close to the work.',
      icon: ArrowRight,
    },
  ];

  return (
    <section id='faq' className='border-t border-border bg-background/75' data-testid='faq-section'>
      <div className='mx-auto max-w-6xl px-4 py-24 md:px-6 md:py-32'>
        <div className='grid gap-10 md:grid-cols-[0.7fr_1.3fr] md:gap-20'>
          <div>
            <p className='text-muted-foreground text-xs font-medium uppercase tracking-[0.18em]'>
              FAQ
            </p>
            <h2 className='mt-3 text-3xl font-semibold tracking-tight'>A little context.</h2>
          </div>
          <AnimatedAccordion items={questions} />
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className='border-t border-border bg-background px-4 py-8 md:px-6'>
      <div className='text-muted-foreground mx-auto flex max-w-6xl flex-col justify-between gap-3 text-sm sm:flex-row'>
        <span className='font-medium text-foreground'>{APP_NAME}</span>
        <span>Interfaces for the in-between moments.</span>
        <span>y31.dev</span>
      </div>
    </footer>
  );
}

export function WorkspaceShell({
  brief,
  canGenerate,
  chatMessages,
  error,
  onBriefChange,
  onRefine,
  onSubmit,
  status,
  surface,
}: {
  brief: string;
  canGenerate: boolean;
  chatMessages: WorkspaceMessage[];
  error?: string;
  onBriefChange: (brief: string) => void;
  onRefine: (instruction: string) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  status: 'idle' | 'loading';
  surface?: GeneratedInterface;
}) {
  const draft = brief.trim();
  const draftMessage =
    draft && !chatMessages.some((message) => message.label === 'You' && message.message === draft)
      ? draft
      : undefined;

  return (
    <section
      className='relative z-10 mx-auto grid min-h-[calc(100dvh-4.5rem)] w-full max-w-7xl grid-cols-1 pt-4 md:h-[calc(100dvh-4.5rem)] md:grid-cols-[minmax(300px,360px)_1fr]'
      data-testid='workspace-shell'
    >
      <aside className='order-2 flex min-w-0 flex-col border-t border-border bg-background/40 px-4 pb-4 backdrop-blur-md md:order-0 md:min-h-0 md:border-r md:border-t-0 md:px-6'>
        <div className='border-b border-border py-4'>
          <p className='text-muted-foreground text-sm'>A visual interface for whatever is next</p>
          <h2 className='text-lg font-medium'>{APP_NAME}</h2>
        </div>
        <ChatThread draft={draftMessage} messages={chatMessages} />
        <div className='[view-transition-name:interface-chat]' data-testid='workspace-prompt'>
          <PromptForm
            brief={brief}
            canGenerate={canGenerate}
            error={error}
            onBriefChange={onBriefChange}
            onSubmit={onSubmit}
            status={status}
            variant='rail'
          />
        </div>
      </aside>

      <section
        className='order-1 min-w-0 overflow-visible border-t border-border bg-background/20 p-4 backdrop-blur-sm md:order-0 md:overflow-y-auto md:border-t-0 md:p-6'
        data-testid='app-panel'
      >
        {surface ? (
          <GeneratedSurface
            key={`${surface.title}-${surface.summary}`}
            surface={surface}
            onRefine={onRefine}
          />
        ) : (
          <EmptySurface status={status} />
        )}
      </section>
    </section>
  );
}

function PromptForm({
  brief,
  canGenerate,
  error,
  onBriefChange,
  onSubmit,
  status = 'idle',
  variant,
}: {
  brief: string;
  canGenerate: boolean;
  error?: string;
  onBriefChange: (brief: string) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  status?: 'idle' | 'loading';
  variant: 'hero' | 'rail';
}) {
  const textareaHeight = variant === 'hero' ? 'min-h-16 md:min-h-20' : 'min-h-32';
  const remainingCharacters = Math.max(0, 8 - brief.trim().length);

  return (
    <form
      onSubmit={onSubmit}
      className='space-y-2 rounded-2xl border border-foreground/15 bg-background/85 p-2 text-left shadow-2xl backdrop-blur-xl'
    >
      <label className='sr-only' htmlFor='brief'>
        What do you want to work through?
      </label>
      <Textarea
        id='brief'
        name='brief'
        value={brief}
        onChange={(event) => onBriefChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return;

          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
        className={`${textareaHeight} resize-none rounded-xl border-0 bg-transparent px-4 py-3 text-base leading-6 text-foreground shadow-none caret-foreground placeholder:text-muted-foreground focus-visible:ring-0`}
        aria-describedby='brief-guidance'
        placeholder='Plan a trip, compare options, or make a workflow…'
      />
      <p id='brief-guidance' className='px-2 text-xs text-muted-foreground'>
        {status === 'loading'
          ? 'Updating the surface with this focus.'
          : canGenerate
            ? 'Ready to open a surface.'
            : `Describe the task in ${remainingCharacters} more character${
                remainingCharacters === 1 ? '' : 's'
              } to continue.`}
      </p>
      {error ? <p className='text-danger text-sm'>{error}</p> : null}
      <div className='flex items-center justify-between gap-3 border-t border-border/70 pt-2'>
        <p className='text-muted-foreground hidden text-xs sm:block'>
          Enter to open · Shift+Enter for a new line
        </p>
        <Button
          type='submit'
          disabled={!canGenerate}
          className='gap-2 rounded-xl px-4 disabled:cursor-not-allowed disabled:border-muted disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100'
        >
          {status === 'loading' ? (
            <LoaderCircle className='size-4 animate-spin' />
          ) : (
            <WandSparkles className='size-4' />
          )}
          Open surface
          <ArrowRight className='size-4' />
        </Button>
      </div>
    </form>
  );
}

function ChatThread({ draft, messages }: { draft?: string; messages: WorkspaceMessage[] }) {
  return (
    <div className='max-h-52 min-h-0 space-y-3 overflow-y-auto py-4' data-testid='chat-thread'>
      {messages.map((message, index) => (
        <ChatMessage key={`${message.label}-${message.message}-${index}`} {...message} />
      ))}
      {draft ? <ChatMessage label='Draft' message={draft} /> : null}
      {!messages.length && !draft ? (
        <p className='text-muted-foreground text-sm'>Your prompt will appear here.</p>
      ) : null}
    </div>
  );
}

function ChatMessage({ label, message }: { label: string; message: string }) {
  return (
    <div className='rounded-lg border border-border bg-background/60 p-3 text-sm'>
      <p className='text-muted-foreground mb-1 text-xs'>{label}</p>
      <p className='leading-6'>{message}</p>
    </div>
  );
}

function EmptySurface({ status }: { status: 'idle' | 'loading' }) {
  const isLoading = status === 'loading';

  return (
    <div className='flex min-h-[calc(100dvh-8rem)] items-center justify-center border-y border-border'>
      <div className='max-w-sm space-y-3 px-4 text-center' role='status' aria-live='polite'>
        {isLoading ? (
          <LoaderCircle className='text-muted-foreground mx-auto size-8 animate-spin' />
        ) : (
          <WandSparkles className='text-muted-foreground mx-auto size-8' />
        )}
        <h2 className='font-medium'>{isLoading ? 'Generating surface' : 'No surface yet'}</h2>
        <p className='text-muted-foreground text-sm'>
          {isLoading
            ? 'The interface is being shaped from your prompt.'
            : 'The generated interface will appear here.'}
        </p>
      </div>
    </div>
  );
}

export function GeneratedSurface({
  surface,
  onRefine,
}: {
  surface: GeneratedInterface;
  onRefine: (instruction: string) => void;
}) {
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
            <Badge>{surface.backend.kind}</Badge>
          </div>
        </div>
        <p className='text-muted-foreground max-w-3xl text-sm leading-6'>{surface.summary}</p>
      </header>

      <ControlRail controls={surface.controls} onRefine={onRefine} />

      <div className='grid gap-6 xl:grid-cols-[1fr_300px]'>
        <div className='space-y-6'>
          {surface.sections.map((section) => (
            <SurfaceSection key={section.id} section={section} />
          ))}
        </div>

        <aside className='space-y-6'>
          <ActionStack surface={surface} onRefine={onRefine} />
        </aside>
      </div>
    </div>
  );
}

export function ControlRail({
  controls,
  onRefine,
}: {
  controls: GeneratedControl[];
  onRefine: (instruction: string) => void;
}) {
  const initialValues = useMemo(
    () => Object.fromEntries(controls.map((control) => [control.id, control.value])),
    [controls],
  );
  const [values, setValues] = useState<Record<string, string>>(initialValues);

  useEffect(() => setValues(initialValues), [initialValues]);

  const setControlValue = (control: GeneratedControl, value: string) => {
    setValues((current) => ({ ...current, [control.id]: value }));
    onRefine(`Update ${control.label.toLowerCase()} to ${value}.`);
  };

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
            onChange={(value) => setControlValue(control, value)}
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

export function ActionStack({
  surface,
  onRefine,
}: {
  surface: GeneratedInterface;
  onRefine: (instruction: string) => void;
}) {
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
            onClick={() => onRefine(action.intent)}
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
