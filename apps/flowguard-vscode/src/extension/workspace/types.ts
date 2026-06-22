import type {
  FlowguardFlow,
  CanonicalDigest,
  FlowProposal,
  FlowguardConfig,
  SemanticIssue,
} from '@workspace/flowguard-contracts';

export const FLOWGUARD_DIRECTORY = '.flowguard';
export const FLOWGUARD_CONFIG_FILE = 'config.json';
export const FLOWGUARD_WATCH_PATTERN = `${FLOWGUARD_DIRECTORY}/**/*.json`;

export interface WorkspaceRoot {
  readonly uri: string;
  readonly name: string;
  readonly index: number;
}

export type WorkspaceDirectoryEntryType = 'file' | 'directory' | 'unknown';

export interface WorkspaceDirectoryEntry {
  readonly name: string;
  readonly type: WorkspaceDirectoryEntryType;
}

export interface WorkspaceFileSystem {
  readFile(uri: string): Promise<string>;
  readDirectory(uri: string): Promise<readonly WorkspaceDirectoryEntry[]>;
}

export interface WorkspaceDisposable {
  dispose(): void;
}

export type WorkspaceFileEventKind = 'create' | 'change' | 'delete';

export interface WorkspaceFileEvent {
  readonly kind: WorkspaceFileEventKind;
  readonly root: WorkspaceRoot;
  readonly uri: string;
}

export type WorkspaceFileEventListener = (event: WorkspaceFileEvent) => void;

export interface WorkspaceFileWatcher extends WorkspaceDisposable {
  onDidCreate(listener: WorkspaceFileEventListener): WorkspaceDisposable;
  onDidChange(listener: WorkspaceFileEventListener): WorkspaceDisposable;
  onDidDelete(listener: WorkspaceFileEventListener): WorkspaceDisposable;
}

export interface WorkspaceFileWatcherProvider {
  watch(root: WorkspaceRoot, pattern: string): WorkspaceFileWatcher;
}

export type WorkspaceScheduledCallback = () => void | Promise<void>;

export interface WorkspaceDebounceScheduler {
  schedule(callback: WorkspaceScheduledCallback, delayMs: number): WorkspaceDisposable;
}

export interface FlowguardWorkspaceSnapshot {
  readonly version: 1;
  readonly sequence: number;
  readonly generatedAt: string;
  readonly repositories: readonly FlowguardRepositorySnapshot[];
}

export interface FlowguardRepositorySnapshot {
  readonly root: WorkspaceRoot;
  readonly config: FlowguardConfigSnapshot;
  readonly flows: readonly FlowguardFlowDocumentSnapshot[];
  readonly proposals: readonly FlowProposalDocumentSnapshot[];
  readonly invalidDocuments: readonly InvalidFlowguardDocumentSnapshot[];
  readonly diagnosticDocuments: readonly FlowguardDiagnosticDocument[];
  readonly watchPatterns: readonly string[];
}

export interface FlowguardConfigSnapshot {
  readonly kind: 'config';
  readonly root: WorkspaceRoot;
  readonly uri: string;
  readonly relativePath: string;
  readonly source: 'default' | 'file';
  readonly valid: boolean;
  readonly activeConfig: FlowguardConfig;
  readonly document?: FlowguardConfig;
  readonly digest: CanonicalDigest;
  readonly documentDigest?: CanonicalDigest;
  readonly issues: readonly SemanticIssue[];
}

export interface FlowguardFlowDocumentSnapshot {
  readonly kind: 'flow';
  readonly root: WorkspaceRoot;
  readonly uri: string;
  readonly relativePath: string;
  readonly valid: true;
  readonly document: FlowguardFlow;
  readonly digest: CanonicalDigest;
  readonly issues: readonly SemanticIssue[];
}

export interface FlowProposalDocumentSnapshot {
  readonly kind: 'proposal';
  readonly root: WorkspaceRoot;
  readonly uri: string;
  readonly relativePath: string;
  readonly valid: true;
  readonly document: FlowProposal;
  readonly digest: CanonicalDigest;
  readonly issues: readonly SemanticIssue[];
}

export type InvalidFlowguardDocumentKind = 'config' | 'flow' | 'proposal';

export interface InvalidFlowguardDocumentSnapshot {
  readonly kind: InvalidFlowguardDocumentKind;
  readonly root: WorkspaceRoot;
  readonly uri: string;
  readonly relativePath: string;
  readonly valid: false;
  readonly issues: readonly SemanticIssue[];
}

export interface FlowguardDiagnosticDocument {
  readonly kind: InvalidFlowguardDocumentKind;
  readonly uri: string;
  readonly relativePath: string;
  readonly text: string;
  readonly issues: readonly SemanticIssue[];
}
