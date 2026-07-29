import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { installGeneratedAppModules } from '#/features/apps/runtime/generated-app-modules';
import { configureLocalAppBridge } from '#/features/apps/runtime/generated-app-sdk';
import type {
  FrameToHostMessage,
  HostToFrameMessage,
  JsonValue,
} from '#/features/apps/runtime/protocol';
import { rewriteGeneratedAppBundle } from '#/features/apps/runtime/rewrite-bundle';

import '@workspace/ui/globals.css';
import '#/theme-overrides.css';

type PendingCall = {
  reject: (error: Error) => void;
  resolve: (value: JsonValue) => void;
};

const pendingCalls = new Map<string, PendingCall>();
let token = '';
let root: Root | undefined;
let resizeObserver: ResizeObserver | undefined;

const send = (message: FrameToHostMessage) => window.parent.postMessage(message, '*');

const render = (node: React.ReactNode) => {
  root ??= createRoot(document.getElementById('root')!);
  root.render(node);
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error?: string }> {
  state: { error?: string } = {};

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? error.message : 'The local app stopped unexpectedly.',
    };
  }

  render() {
    if (this.state.error) {
      return (
        <main className='mx-auto max-w-3xl px-6 py-10 text-danger' role='alert'>
          {this.state.error}
        </main>
      );
    }
    return this.props.children;
  }
}

const loadApp = async (message: Extract<HostToFrameMessage, { type: 'y31:initialize' }>) => {
  if (token) return;
  token = message.token;
  configureLocalAppBridge({
    app: message.app,
    initialState: message.state,
    invoke: (capabilityId, input) =>
      new Promise<JsonValue>((resolve, reject) => {
        const requestId = crypto.randomUUID();
        pendingCalls.set(requestId, { reject, resolve });
        send({
          type: 'y31:capability-call',
          token,
          requestId,
          capabilityId,
          input,
        });
      }),
    setState: (key, value) => send({ type: 'y31:state-set', token, key, value }),
  });

  const urls = installGeneratedAppModules();
  const bundle = rewriteGeneratedAppBundle(message.bundle, urls);
  const appUrl = URL.createObjectURL(new Blob([bundle], { type: 'text/javascript' }));

  try {
    const loaded = (await import(/* @vite-ignore */ appUrl)) as { default?: React.ComponentType };
    if (!loaded.default) throw new Error('App.tsx must export a default React component.');
    const App = loaded.default;
    render(
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>,
    );
    observeHeight();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The local app could not start.';
    render(
      <main className='mx-auto max-w-3xl px-6 py-10 text-danger' role='alert'>
        {message}
      </main>,
    );
  } finally {
    URL.revokeObjectURL(appUrl);
    Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }
};

const observeHeight = () => {
  resizeObserver ??= new ResizeObserver(() => {
    send({
      type: 'y31:resize',
      token,
      height: Math.ceil(document.documentElement.scrollHeight),
    });
  });
  resizeObserver.observe(document.body);
};

window.addEventListener('message', (event: MessageEvent<HostToFrameMessage>) => {
  if (event.source !== window.parent) return;
  if (!event.data || typeof event.data !== 'object' || !('type' in event.data)) return;
  if (event.data.type === 'y31:initialize') {
    void loadApp(event.data);
    return;
  }
  if (event.data.type !== 'y31:capability-result' || event.data.token !== token) return;
  const pending = pendingCalls.get(event.data.requestId);
  if (!pending) return;
  pendingCalls.delete(event.data.requestId);
  if (event.data.error) pending.reject(new Error(event.data.error));
  else pending.resolve(event.data.result ?? null);
});

send({ type: 'y31:ready' });
