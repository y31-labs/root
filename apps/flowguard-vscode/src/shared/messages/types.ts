import type {
  FlowguardGraph,
  CanonicalDigest,
  FlowProposalConfidence,
} from '@workspace/flowguard-contracts';

export const flowguardMessageProtocol = 'flowguard.webview' as const;
export const flowguardMessageVersion = 1 as const;

export const flowguardHostToWebviewMessageTypes = [
  'host/snapshot',
  'host/open',
  'host/error',
] as const;

export const flowguardWebviewToHostMessageTypes = [
  'webview/ready',
  'intent/open',
  'intent/refresh',
  'intent/reveal-source',
  'intent/accept',
  'intent/reject',
] as const;

export type FlowguardHostToWebviewMessageType = (typeof flowguardHostToWebviewMessageTypes)[number];

export type FlowguardWebviewToHostMessageType = (typeof flowguardWebviewToHostMessageTypes)[number];

export interface FlowguardMessageEnvelope<TType extends string, TPayload> {
  readonly protocol: typeof flowguardMessageProtocol;
  readonly version: typeof flowguardMessageVersion;
  readonly type: TType;
  readonly payload: TPayload;
}

export type FlowguardHostToWebviewMessage =
  | FlowguardMessageEnvelope<'host/snapshot', FlowguardWebviewSnapshot>
  | FlowguardMessageEnvelope<'host/open', FlowguardOpenIntent>
  | FlowguardMessageEnvelope<'host/error', FlowguardHostError>;

export type FlowguardWebviewToHostMessage =
  | FlowguardMessageEnvelope<'webview/ready', EmptyFlowguardMessagePayload>
  | FlowguardMessageEnvelope<'intent/open', FlowguardOpenIntent>
  | FlowguardMessageEnvelope<'intent/refresh', EmptyFlowguardMessagePayload>
  | FlowguardMessageEnvelope<'intent/reveal-source', FlowguardRevealSourceIntent>
  | FlowguardMessageEnvelope<'intent/accept', FlowguardProposalDecisionIntent>
  | FlowguardMessageEnvelope<'intent/reject', FlowguardProposalDecisionIntent>;

export type EmptyFlowguardMessagePayload = Record<string, never>;

export interface FlowguardOpenIntent {
  readonly rootUri: string;
  readonly flowId: string;
  readonly proposalId?: string;
}

export interface FlowguardRevealSourceIntent {
  readonly rootUri: string;
  readonly flowId: string;
  readonly sourcePath: string;
  readonly proposalId?: string;
  readonly target?: FlowguardRevealSourceTarget;
}

export type FlowguardRevealSourceTarget =
  | {
      readonly kind: 'state';
      readonly stateId: string;
    }
  | {
      readonly kind: 'transition';
      readonly transitionId: string;
    };

export interface FlowguardProposalDecisionIntent {
  readonly rootUri: string;
  readonly proposalId: string;
}

export interface FlowguardHostError {
  readonly code: FlowguardHostErrorCode;
  readonly message: string;
}

export type FlowguardHostErrorCode = 'INVALID_MESSAGE' | 'INTENT_REJECTED' | 'HANDLER_ERROR';

export interface FlowguardWebviewSnapshot {
  readonly version: 1;
  readonly sequence: number;
  readonly generatedAt: string;
  readonly repositories: readonly FlowguardWebviewRepositorySnapshot[];
}

export interface FlowguardWebviewRepositorySnapshot {
  readonly root: FlowguardWebviewWorkspaceRoot;
  readonly flows: readonly FlowguardWebviewFlowSnapshot[];
  readonly proposals: readonly FlowguardWebviewProposalSnapshot[];
  readonly invalidDocuments: readonly FlowguardWebviewInvalidDocumentSnapshot[];
}

export interface FlowguardWebviewWorkspaceRoot {
  readonly uri: string;
  readonly name: string;
  readonly index: number;
}

export interface FlowguardWebviewFlowSnapshot {
  readonly flowId: string;
  readonly name: string;
  readonly goal: string;
  readonly relativePath: string;
  readonly digest: CanonicalDigest;
  readonly graph: FlowguardGraph;
  readonly sourceReferences: readonly FlowguardWebviewSourceReference[];
}

export interface FlowguardWebviewProposalSnapshot {
  readonly proposalId: string;
  readonly flowId: string;
  readonly summary: string;
  readonly confidence: FlowProposalConfidence;
  readonly relativePath: string;
  readonly digest: CanonicalDigest;
  readonly graph?: FlowguardGraph;
  readonly sourceReferences: readonly FlowguardWebviewSourceReference[];
}

export interface FlowguardWebviewSourceReference {
  readonly target: FlowguardRevealSourceTarget;
  readonly label: string;
  readonly sources: readonly string[];
}

export interface FlowguardWebviewInvalidDocumentSnapshot {
  readonly kind: 'config' | 'flow' | 'proposal';
  readonly relativePath: string;
  readonly issueCount: number;
}

export type FlowguardMessageValidationResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    };
