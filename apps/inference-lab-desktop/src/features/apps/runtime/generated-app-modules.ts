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

import * as sdk from '#/features/apps/runtime/generated-app-sdk';
import * as ui from '#/features/apps/runtime/generated-app-ui';
import type { LocalAppModuleUrls } from '#/features/apps/runtime/rewrite-bundle';

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

const createShim = (moduleName: 'icons' | 'react' | 'sdk' | 'ui', exports: string[]) => {
  const declarations = exports.map(
    (name) => `export const ${name} = globalThis.__Y31_RUNTIME__.${moduleName}.${name};`,
  );
  if (moduleName === 'react') {
    declarations.unshift('export default globalThis.__Y31_RUNTIME__.react;');
  }
  return URL.createObjectURL(new Blob([declarations.join('\n')], { type: 'text/javascript' }));
};

export const installGeneratedAppModules = (): LocalAppModuleUrls => {
  Object.assign(globalThis, { __Y31_RUNTIME__: { icons: iconSdk, react: React, sdk, ui } });
  return {
    icons: createShim('icons', ICON_EXPORTS),
    react: createShim('react', REACT_EXPORTS),
    sdk: createShim('sdk', SDK_EXPORTS),
    ui: createShim('ui', UI_EXPORTS),
  };
};

declare global {
  var __Y31_RUNTIME__: {
    icons: typeof iconSdk;
    react: typeof React;
    sdk: typeof sdk;
    ui: typeof ui;
  };
}
