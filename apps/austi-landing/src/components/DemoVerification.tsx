import { Button } from '@workspace/ui/components/ui/button';
import { useEffect, useRef, useState } from 'react';

type Turnstile = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      cData: string;
      theme: 'light';
      size: 'flexible';
      retry: 'never';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
      'timeout-callback': () => void;
    },
  ) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let scriptLoading: Promise<Turnstile> | undefined;
const loadTurnstile = (): Promise<Turnstile> => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('Verification could not load'));
    };
    const timeout = window.setTimeout(fail, 15_000);
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      if (!window.turnstile) return fail();
      window.clearTimeout(timeout);
      resolve(window.turnstile);
    };
    script.onerror = fail;
    document.head.append(script);
  }).catch((error) => {
    scriptLoading = undefined;
    throw error;
  });
  return scriptLoading;
};

export function DemoVerification({
  sessionToken,
  attempt,
  onToken,
}: {
  sessionToken: string;
  attempt: number;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const siteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    onToken(null);
    setError(null);
    if (!siteKey) return;
    let disposed = false;
    let widget: { api: Turnstile; id: string } | undefined;
    const fail = () => {
      if (disposed) return;
      onToken(null);
      setError('Verification is unavailable. Please try again.');
    };
    void loadTurnstile()
      .then((api) => {
        if (disposed || !container.current) return;
        const id = api.render(container.current, {
          sitekey: siteKey,
          cData: sessionToken,
          theme: 'light',
          size: 'flexible',
          retry: 'never',
          callback: (token) => {
            if (disposed) return;
            setError(null);
            onToken(token);
          },
          'expired-callback': () => {
            if (!disposed) onToken(null);
          },
          'error-callback': fail,
          'timeout-callback': fail,
        });
        widget = { api, id };
      })
      .catch(fail);
    return () => {
      disposed = true;
      if (widget) widget.api.remove(widget.id);
    };
  }, [sessionToken, attempt, retry, siteKey, onToken]);

  return (
    <div className='demo-verification'>
      <div ref={container} />
      {!siteKey && (
        <p>Live chat is temporarily unavailable. You can still explore the workflow examples.</p>
      )}
      {error && (
        <div role='alert'>
          <p>{error}</p>
          <Button
            variant='outline'
            className='demo-button'
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry verification
          </Button>
        </div>
      )}
    </div>
  );
}
