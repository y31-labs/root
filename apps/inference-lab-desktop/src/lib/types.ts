export interface ProjectSummary {
  id: string;
  title: string;
  brief: string;
  description: string;
  versionCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  ordinal: number;
  instruction: string;
  title: string;
  description: string;
  html: string;
  backendDetail: string;
  createdAt: number;
}

export interface Project {
  id: string;
  title: string;
  brief: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  versions: ProjectVersion[];
}

export interface AppSettings {
  inferenceServiceUrl: string;
}

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

export interface ReasoningEffort {
  reasoningEffort: string;
}

export interface ServiceTier {
  id: string;
  name: string;
}

export interface Model {
  model: string;
  displayName: string;
  supportedReasoningEfforts: ReasoningEffort[];
  defaultReasoningEffort: string;
  serviceTiers: ServiceTier[];
  defaultServiceTier: string | null;
  isDefault: boolean;
}

export interface ModelSettings {
  model: string;
  effort: string;
  serviceTier: string | null;
}

export type ChatStreamEvent =
  | { type: 'started'; threadId: string }
  | { type: 'delta'; text: string }
  | { type: 'completed' };

export interface ChatTextResult {
  threadId: string;
}
