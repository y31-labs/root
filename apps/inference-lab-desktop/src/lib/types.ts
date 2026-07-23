export interface CodexIntegrationStatus {
  installed: boolean;
  authenticated: boolean;
  appServerAvailable: boolean;
  connected: boolean;
  version: string | null;
  accountEmail: string | null;
  planType: string | null;
  detail: string | null;
}

export interface Model {
  model: string;
  displayName: string;
  reason: {
    options: string[];
    default: string;
  };
  speed: {
    options: string[];
    default: string;
  };
  isDefault: boolean;
}

export interface ModelSettings {
  model: string;
  reason: string;
  speed: string;
}

export type ChatStreamEvent =
  | { type: 'started'; threadId: string }
  | { type: 'delta'; text: string }
  | { type: 'completed' };

export interface ChatTextResult {
  threadId: string;
}
