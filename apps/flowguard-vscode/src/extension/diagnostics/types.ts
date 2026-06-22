import type { SemanticIssue } from '@workspace/flowguard-contracts';

export interface FlowguardDiagnosticPosition {
  readonly line: number;
  readonly character: number;
}

export interface FlowguardDiagnosticRange {
  readonly start: FlowguardDiagnosticPosition;
  readonly end: FlowguardDiagnosticPosition;
}

export type FlowguardDiagnosticSeverity = SemanticIssue['severity'];

export interface FlowguardDiagnostic {
  readonly source: 'Flowguard';
  readonly code: SemanticIssue['code'];
  readonly severity: FlowguardDiagnosticSeverity;
  readonly message: string;
  readonly range: FlowguardDiagnosticRange;
  readonly jsonPath: string;
}

export interface FlowguardDiagnosticSink {
  set(uri: string, diagnostics: readonly FlowguardDiagnostic[]): void;
  delete(uri: string): void;
  dispose?(): void;
}
