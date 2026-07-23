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

export type PermissionMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export type CodexApprovalDecision = 'accept' | 'acceptForSession' | 'decline';

export type CodexApprovalMethod =
  | 'item/commandExecution/requestApproval'
  | 'item/fileChange/requestApproval';

export interface CodexApprovalRequest {
  requestId: string | number;
  method: CodexApprovalMethod;
  title: string;
  detail?: string;
}

export type ChatStreamEvent =
  | { type: 'started'; threadId: string }
  | { type: 'delta'; text: string }
  | ({ type: 'approval' } & CodexApprovalRequest)
  | { type: 'completed' };

export interface ChatTextResult {
  threadId: string;
}
