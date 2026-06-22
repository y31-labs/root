import type { FlowguardTreeItem } from '#/extension/tree';
import type { FlowguardWorkspaceSnapshot, WorkspaceRoot } from '#/extension/workspace';

export type FlowguardCommandSelection =
  | FlowguardTreeItem
  | {
      readonly rootUri?: string;
      readonly flowId?: string;
      readonly proposalId?: string;
      readonly uri?: string;
    };

export interface FlowguardCommandWorkspace {
  getSnapshot(): FlowguardWorkspaceSnapshot | undefined;
  getWorkspaceRoots(): readonly WorkspaceRoot[] | undefined;
  refresh(): Promise<FlowguardWorkspaceSnapshot>;
}

export interface FlowguardCommandPresenter {
  showInformationMessage(message: string): unknown | Promise<unknown>;
  showErrorMessage?: (message: string) => unknown | Promise<unknown>;
}

export interface FlowguardDocumentOpener {
  openDocument(uri: string): void | Promise<void>;
}

export interface FlowguardRepositoryInitializationResult {
  readonly root: WorkspaceRoot;
  readonly message?: string;
}

export interface FlowguardRepositoryInitializer {
  initializeRepository(
    root: WorkspaceRoot,
  ): FlowguardRepositoryInitializationResult | Promise<FlowguardRepositoryInitializationResult>;
}

export interface FlowguardCommandEnvironment {
  readonly workspace: FlowguardCommandWorkspace;
  readonly presenter: FlowguardCommandPresenter;
  readonly opener?: FlowguardDocumentOpener;
  readonly initializer?: FlowguardRepositoryInitializer;
}
