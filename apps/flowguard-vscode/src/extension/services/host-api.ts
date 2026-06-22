import type { DisposableLike } from '#/extension/services/disposables';
import type { WorkspaceFolderLike } from '#/extension/services/service-container';

export interface ExtensionContextLike {
  readonly subscriptions: DisposableLike[];
}

export type CommandHandler = (...args: unknown[]) => unknown;

export interface CommandRegistryLike {
  registerCommand(command: string, handler: CommandHandler): DisposableLike;
}

export interface TreeItemLike {
  readonly label: string;
  readonly description?: string;
  readonly contextValue?: string;
}

export interface TreeDataProviderLike<T> {
  getTreeItem(element: T): TreeItemLike | Promise<TreeItemLike>;
  getChildren(element?: T): readonly T[] | Promise<readonly T[]>;
}

export interface TreeViewOptionsLike<T> {
  readonly treeDataProvider: TreeDataProviderLike<T>;
  readonly showCollapseAll?: boolean;
}

export interface WindowLike {
  createTreeView<T>(viewId: string, options: TreeViewOptionsLike<T>): DisposableLike;
  showInformationMessage(message: string): unknown;
}

export interface WorkspaceLike {
  readonly workspaceFolders: readonly WorkspaceFolderLike[] | undefined;
}

export interface FlowguardHostApi {
  readonly commands: CommandRegistryLike;
  readonly window: WindowLike;
  readonly workspace: WorkspaceLike;
}
