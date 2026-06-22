import type { SemanticIssue } from '#/issues';

export const flowguardFlowContractVersion = 1 as const;

export type FlowguardFlowContractVersion = typeof flowguardFlowContractVersion;

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;

export interface FlowguardConfig {
  version: 1;
  flowDirectory: string;
  proposalDirectory: string;
}

export const defaultFlowguardConfig: FlowguardConfig = {
  version: 1,
  flowDirectory: 'flows',
  proposalDirectory: 'proposals',
};

export const flowStateKinds = ['page', 'dialog', 'panel', 'system', 'terminal'] as const;
export type FlowStateKind = (typeof flowStateKinds)[number];

export const flowActors = ['user', 'system', 'external'] as const;
export type FlowActor = (typeof flowActors)[number];

export interface FlowguardFlow {
  version: 1;
  id: string;
  name: string;
  goal: string;
  entryStateId: string;
  states: FlowState[];
  transitions: FlowTransition[];
}

export interface FlowState {
  id: string;
  name: string;
  kind: FlowStateKind;
  route?: string;
  description?: string;
  sources?: string[];
  tags?: string[];
}

export interface FlowTransition {
  id: string;
  from: string;
  to: string;
  actor: FlowActor;
  action: string;
  condition?: string;
  outcome?: string;
  sources?: string[];
  tags?: string[];
}

export type FlowStatePatch = Partial<Omit<FlowState, 'id'>>;
export type FlowTransitionPatch = Partial<Omit<FlowTransition, 'id'>>;
export type FlowMetadataPatch = Partial<Pick<FlowguardFlow, 'name' | 'goal' | 'entryStateId'>>;

export type CanonicalDigest = `sha256:${string}`;

export const flowProposalConfidences = ['low', 'medium', 'high'] as const;
export type FlowProposalConfidence = (typeof flowProposalConfidences)[number];

export interface FlowProposalProducer {
  kind: string;
  label: string;
}

export interface FlowProposal {
  version: 1;
  id: string;
  flowId: string;
  baseDigest: CanonicalDigest;
  createdAt: string;
  producer: FlowProposalProducer;
  summary: string;
  confidence: FlowProposalConfidence;
  operations: FlowProposalOperation[];
}

export type FlowProposalOperation =
  | { op: 'addState'; state: FlowState; reason: string }
  | { op: 'updateState'; stateId: string; patch: FlowStatePatch; reason: string }
  | { op: 'removeState'; stateId: string; reason: string }
  | { op: 'addTransition'; transition: FlowTransition; reason: string }
  | {
      op: 'updateTransition';
      transitionId: string;
      patch: FlowTransitionPatch;
      reason: string;
    }
  | { op: 'removeTransition'; transitionId: string; reason: string }
  | { op: 'updateFlow'; patch: FlowMetadataPatch; reason: string };

export const flowProposalOperations = [
  'addState',
  'updateState',
  'removeState',
  'addTransition',
  'updateTransition',
  'removeTransition',
  'updateFlow',
] as const;

export type FlowProposalOperationName = (typeof flowProposalOperations)[number];

export type FlowguardGraphStatus = 'unchanged' | 'added' | 'modified' | 'removed' | 'uncertain';

export interface FlowguardGraph {
  flowId: string;
  nodes: FlowguardGraphNode[];
  edges: FlowguardGraphEdge[];
  issues: GraphIssue[];
}

export interface FlowguardGraphNode {
  id: string;
  stateId: string;
  label: string;
  kind: FlowStateKind;
  route?: string;
  status: FlowguardGraphStatus;
}

export interface FlowguardGraphEdge {
  id: string;
  transitionId: string;
  source: string;
  target: string;
  label: string;
  actor: FlowActor;
  status: FlowguardGraphStatus;
}

export interface GraphIssue {
  severity: SemanticIssue['severity'];
  code: string;
  message: string;
  path?: string;
  stateId?: string;
  transitionId?: string;
}

export interface FlowImpact {
  flowId: string;
  level: 'direct' | 'possible' | 'none';
  matchedPaths: string[];
  reasons: string[];
}
