import { Button } from '@workspace/ui/components/ui/button';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import { useEffect, useRef, useState } from 'react';

import { MAX_MESSAGE_LENGTH, type LocalDemoSession } from '../lib/demo-session';
import { useDemoChat } from '../lib/use-demo-chat';
import { DemoIcon } from './DemoIcon';
import { DemoVerification } from './DemoVerification';

type Props = {
  session: LocalDemoSession;
  onChange: (change: Partial<LocalDemoSession>) => void;
  onReset: () => void;
  storageAvailable: boolean;
};

const prompts = [
  'There’s a leak under my kitchen sink.',
  'The heating is not working in my apartment.',
];
const statusLabels = {
  thinking: 'Understanding your request',
  ready: 'Ready for your next step',
  error: 'Response interrupted',
};

export function DemoChat({ session, onChange, onReset, storageAvailable }: Props) {
  const { turns, connected, error, busy, send, configured } = useDemoChat(session, onChange);
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const last = turns.at(-1);
  const status = last?.status;
  const canSend = connected && !busy && !!verificationToken;

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, [session.token]);
  useEffect(() => {
    if (turns.length > 0 && follow.current && transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [turns, busy]);

  const submit = async (text: string, retry = false) => {
    if (!text.trim() || !canSend || !verificationToken) return;
    follow.current = true;
    const draft = session.draft;
    const proof = verificationToken;
    setVerificationToken(null);
    const sent = await send(text, retry, proof);
    setVerificationAttempt((value) => value + 1);
    if (sent) {
      // Do not erase a new draft typed while the request was in flight.
      if (!retry && input.current?.value === draft) onChange({ draft: '' });
      input.current?.focus({ preventScroll: true });
    }
  };

  return (
    <aside className='demo-chat' aria-labelledby='demo-chat-title'>
      <header className='demo-header demo-chat-header'>
        <div className='demo-chat-identity'>
          <img src='/austi-logo.svg' width='22' height='26' alt='' />
          <div>
            <h2 id='demo-chat-title'>Chat with Austi</h2>
            <span>Resident conversation · website demo</span>
          </div>
        </div>
        <Button
          variant='ghost'
          className='demo-chat-reset'
          onClick={onReset}
          disabled={busy}
          aria-label='New chat'
          title='New chat'
        >
          <DemoIcon name='plus' />
        </Button>
      </header>
      <div className='demo-panel'>
        <div
          className='demo-transcript'
          ref={transcript}
          onScroll={() => {
            const node = transcript.current;
            if (node) follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
          }}
        >
          {turns.length === 0 && (
            <div className='demo-empty'>
              <div className='demo-empty-mark' aria-hidden='true'>
                <img src='/austi-logo.svg' width='24' height='28' alt='' />
              </div>
              <p className='demo-eyebrow'>Your maintenance assistant</p>
              <h3>What needs a fix?</h3>
              <p>
                Describe a maintenance issue and see how Austi gathers the details and helps plan
                the next step.
              </p>
              <div className='demo-prompts'>
                <span className='demo-prompt-label'>Try a sample report</span>
                {prompts.map((prompt) => (
                  <Button
                    key={prompt}
                    variant='outline'
                    className='demo-button demo-prompt'
                    onClick={() => {
                      onChange({ draft: prompt });
                      input.current?.focus();
                    }}
                  >
                    {prompt}
                    <DemoIcon name='arrow' />
                  </Button>
                ))}
              </div>
            </div>
          )}
          {turns.map((turn) => (
            <div className='demo-turn' key={turn.id}>
              <div className='demo-message demo-user'>
                <span>You</span>
                <p>{turn.request}</p>
              </div>
              {turn.reply && (
                <div className='demo-message demo-assistant'>
                  <span>Austi{turn.status === 'error' ? ' · Incomplete reply' : ''}</span>
                  <p>{turn.reply}</p>
                </div>
              )}
              {turn.status === 'error' && (
                <div className='demo-error' role='alert'>
                  <p>The response was interrupted. Your message is saved.</p>
                  {turn.id === last?.id && (
                    <Button
                      variant='outline'
                      className='demo-button'
                      disabled={!canSend}
                      onClick={() => void submit(turn.request, true)}
                    >
                      Retry response
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className='sr-only' aria-live='polite' aria-atomic='true'>
          {last?.status === 'ready' && <span key={last.id}>Austi: {last.reply}</span>}
        </div>
        <div className='demo-processing' role='status' aria-live='polite'>
          <span className={`demo-status-dot${busy ? ' is-busy' : ''}`} />
          <span>
            {!connected
              ? 'Explore the sample workflow in the sidebar'
              : status
                ? status === 'thinking' && last.reply
                  ? 'Writing a response'
                  : statusLabels[status]
                : 'Ready for a maintenance report'}
          </span>
        </div>
        {error && (
          <p className='demo-connection-error' role='alert'>
            {error}
          </p>
        )}
        <form
          className='demo-composer'
          onSubmit={(event) => {
            event.preventDefault();
            void submit(session.draft);
          }}
        >
          <label className='sr-only' htmlFor='demo-message'>
            Describe a maintenance issue
          </label>
          <Textarea
            ref={input}
            id='demo-message'
            className='demo-input'
            placeholder='Describe a maintenance issue…'
            maxLength={MAX_MESSAGE_LENGTH}
            value={session.draft}
            onChange={(event) => onChange({ draft: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit(session.draft);
              }
            }}
            aria-describedby='demo-input-note'
          />
          <Button
            className='demo-button demo-send'
            type='submit'
            disabled={!canSend || !session.draft.trim()}
            aria-label='Send message'
          >
            <svg viewBox='0 0 20 20' aria-hidden='true'>
              <path d='M10 15V5m-5 5 5-5 5 5' />
            </svg>
          </Button>
        </form>
        {configured && (
          <DemoVerification
            sessionToken={session.token}
            attempt={verificationAttempt}
            onToken={setVerificationToken}
          />
        )}
        <p className='demo-footnote' id='demo-input-note'>
          Use fictional details. Messages are processed by AI. Chat history stays in this tab’s
          session.
        </p>
      </div>
      <footer className='demo-footer'>
        <span>Planned channels: Telegram, WhatsApp, Instagram</span>
        <span>
          {storageAvailable
            ? 'Session saved in this tab'
            : 'Browser storage unavailable · session will not survive refresh'}
        </span>
      </footer>
    </aside>
  );
}
