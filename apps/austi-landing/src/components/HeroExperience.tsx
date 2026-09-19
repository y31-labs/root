import { Button } from '@workspace/ui/components/ui/button';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import {
  createDemoSession,
  DEMO_STORAGE_KEY,
  parseDemoSession,
  type LocalDemoSession,
} from '../lib/demo-session';

import './HeroExperience.css';

const DemoWorkspace = lazy(() =>
  import('./DemoWorkspace').then(({ DemoWorkspace }) => ({ default: DemoWorkspace })),
);

export function HeroExperience({ pilotUrl }: { pilotUrl: string }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<LocalDemoSession | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const trigger = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    try {
      localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      // Session storage can still work when local storage is blocked.
    }
    try {
      setSession(parseDemoSession(sessionStorage.getItem(DEMO_STORAGE_KEY)));
    } catch {
      setStorageAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    try {
      sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(session));
    } catch {
      setStorageAvailable(false);
    }
  }, [session]);

  const changeSession = (change: Partial<LocalDemoSession>) =>
    setSession((current) => (current ? { ...current, ...change } : current));
  const toggle = () => {
    if (!open && (!session || session.expiresAt <= Date.now())) setSession(createDemoSession());
    setOpen(!open);
    if (open) trigger.current?.focus({ preventScroll: true });
  };

  return (
    <div className='hero-experience' data-open={open}>
      <div className='hero-intro'>
        <h1 className='hero-heading'>
          Your properties
          <br />
          maintained. 24/7.
        </h1>
        <Button
          ref={trigger}
          className='hero-download'
          onClick={toggle}
          aria-expanded={open}
          aria-controls='austi-demo'
        >
          <img
            className='hero-download-hdr'
            src='/images/hero-cta-superwhite.avif'
            alt=''
            width='64'
            height='64'
            aria-hidden='true'
            onLoad={(event) => event.currentTarget.classList.add('is-loaded')}
          />
          <span>{open ? 'Close demo' : session ? 'Continue chat' : 'Start a chat'}</span>
          <svg viewBox='0 0 18 18' aria-hidden='true'>
            <path d={open ? 'M4 4l10 10M14 4 4 14' : 'M3.5 9h11M10 4.5 14.5 9 10 13.5'} />
          </svg>
        </Button>
        <AnimatePresence>
          {open && (
            <motion.div
              className='hero-demo-guide'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.25 }}
            >
              <p>One workspace for your team. A conversation wherever your residents are.</p>
              <a href={pilotUrl}>
                Discuss your maintenance workflow <span aria-hidden='true'>↗</span>
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {open && session && (
          <motion.div
            className='hero-demo-stage'
            key='workspace'
            initial={{ opacity: 0, x: reducedMotion ? 0 : -48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reducedMotion ? 0 : -24 }}
            transition={{ duration: reducedMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <Suspense fallback={<p role='status'>Loading demo…</p>}>
              <DemoWorkspace
                session={session}
                onChange={changeSession}
                onReset={() =>
                  setSession((current) => ({
                    ...createDemoSession(),
                    tab: current?.tab ?? 'Approvals',
                    approved: current?.approved ?? false,
                  }))
                }
                storageAvailable={storageAvailable}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
