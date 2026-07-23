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

export type ModelSpeed = 'standard' | 'fast';

export interface Model {
  model: string;
  displayName: string;
  effort: {
    options: string[];
    default: string;
  };
  speed: {
    options: ModelSpeed[];
    default: ModelSpeed;
  };
  isDefault: boolean;
}

export interface ModelSettings {
  model: string;
  effort: string;
  speed: ModelSpeed;
}

export type ChatStreamEvent =
  | { type: 'started'; threadId: string }
  | { type: 'delta'; text: string }
  | { type: 'completed' };

export interface ChatTextResult {
  threadId: string;
}
