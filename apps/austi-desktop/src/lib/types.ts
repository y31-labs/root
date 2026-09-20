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

export type CodexActivityKind =
  | 'agent'
  | 'command'
  | 'error'
  | 'file'
  | 'image'
  | 'plan'
  | 'read'
  | 'search'
  | 'tool'
  | 'wait'
  | 'web';
export type CodexActivityStatus = 'running' | 'succeeded' | 'failed';

export interface CodexActivityItem {
  id: string;
  label: string;
  detail?: string;
}

export interface CodexActivity {
  id: string;
  kind: CodexActivityKind;
  label: string;
  detail?: string;
  items?: CodexActivityItem[];
  status: CodexActivityStatus;
}

export type ChatTranscriptPart =
  | { type: 'message'; id: string; text: string }
  | { type: 'reasoning'; id: string; summaries: string[] }
  | { type: 'activity'; id: string; activities: CodexActivity[] };

export type ChatStreamEvent =
  | { type: 'started'; threadId: string; turnId: string }
  | { type: 'messageDelta'; id: string; text: string }
  | { type: 'reasoningDelta'; id: string; summaryIndex: number; text: string }
  | ({ type: 'activity' } & CodexActivity)
  | { type: 'activityDelta'; id: string; delta: string }
  | ({ type: 'approval' } & CodexApprovalRequest)
  | { type: 'completed' };

export interface ChatTextResult {
  threadId: string;
}

export interface CodexRunInfo {
  runId: string;
  chatId: string;
  threadId: string;
  turnId: string;
  assistantMessageId: string;
  model?: string;
}

export interface CodexRunStatus extends CodexRunInfo {
  active: boolean;
}

export interface CodexActivityCustomEventPayload {
  assistantMessageId: string;
  activity: CodexActivity;
}

export interface CodexActivityDeltaCustomEventPayload {
  assistantMessageId: string;
  id: string;
  delta: string;
}

export interface CodexReasoningDeltaCustomEventPayload {
  assistantMessageId: string;
  id: string;
  summaryIndex: number;
  delta: string;
}

export interface CodexApprovalCustomEventPayload {
  assistantMessageId: string;
  approval: CodexApprovalRequest;
}
