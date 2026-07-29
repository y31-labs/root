import {
  Activity,
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock,
  Database,
  FileText,
  Filter,
  Gauge,
  Inbox,
  Info,
  LoaderCircle,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Triangle,
  X,
  Zap,
} from 'lucide-react';
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import * as sdk from '#/features/apps/runtime/generated-app-sdk';
import { configureLocalAppBridge } from '#/features/apps/runtime/generated-app-sdk';
import * as ui from '#/features/apps/runtime/generated-app-ui';
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

const createShim = (moduleName: 'icons' | 'react' | 'sdk' | 'ui', exports: string[]) => {
  const declarations = exports.map(
    (name) => `export const ${name} = globalThis.__Y31_RUNTIME__.${moduleName}.${name};`,
  );
  if (moduleName === 'react') {
    declarations.unshift('export default globalThis.__Y31_RUNTIME__.react;');
  }
  return URL.createObjectURL(new Blob([declarations.join('\n')], { type: 'text/javascript' }));
};

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

  Object.assign(globalThis, { __Y31_RUNTIME__: { icons: iconSdk, react: React, sdk, ui } });
  const urls = {
    icons: createShim('icons', ICON_EXPORTS),
    react: createShim('react', REACT_EXPORTS),
    sdk: createShim('sdk', SDK_EXPORTS),
    ui: createShim('ui', UI_EXPORTS),
  };
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

const REACT_EXPORTS = [
  'Children',
  'Fragment',
  'cloneElement',
  'createContext',
  'createElement',
  'forwardRef',
  'memo',
  'useCallback',
  'useContext',
  'useEffect',
  'useId',
  'useMemo',
  'useReducer',
  'useRef',
  'useState',
];
const SDK_EXPORTS = ['useAppInfo', 'useCapability', 'usePersistentState'];
const UI_EXPORTS = [
  'AppStyles',
  'Badge',
  'Box',
  'Button',
  'DataTable',
  'Field',
  'Grid',
  'Inline',
  'Input',
  'Label',
  'Page',
  'Section',
  'SelectField',
  'Separator',
  'SliderField',
  'Stack',
  'Stat',
  'Surface',
  'SwitchField',
  'Textarea',
];
const ICON_EXPORTS = [
  'Activity',
  'Bell',
  'Calendar',
  'Check',
  'ChevronDown',
  'ChevronRight',
  'CircleAlert',
  'Clock',
  'Database',
  'FileText',
  'Filter',
  'Gauge',
  'Inbox',
  'Info',
  'LoaderCircle',
  'MessageSquare',
  'Pause',
  'Play',
  'RefreshCw',
  'Search',
  'Settings',
  'Sparkles',
  'Triangle',
  'X',
  'Zap',
];

const iconSdk = {
  Activity,
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock,
  Database,
  FileText,
  Filter,
  Gauge,
  Inbox,
  Info,
  LoaderCircle,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Triangle,
  X,
  Zap,
};

declare global {
  var __Y31_RUNTIME__: {
    icons: typeof iconSdk;
    react: typeof React;
    sdk: typeof sdk;
    ui: typeof ui;
  };
}
