import { FLOWGUARD_VIEWS } from '#/extension/services/constants';
import type { FlowguardHostApi, TreeDataProviderLike } from '#/extension/services/host-api';
import type { FlowguardServiceContainer } from '#/extension/services/service-container';
import {
  createFlowTreeItems,
  createProposalTreeItems,
  type FlowguardTreeItem,
  type FlowTreeOptions,
} from '#/extension/tree/model';
import type { FlowguardWorkspaceSnapshot } from '#/extension/workspace';

export type FlowguardTreeDataChangeListener = (element?: FlowguardTreeItem) => void;

export interface FlowguardTreeDataChangeDisposable {
  dispose(): void;
}

class TreeDataChangeEmitter {
  readonly #listeners = new Set<FlowguardTreeDataChangeListener>();

  event(listener: FlowguardTreeDataChangeListener): FlowguardTreeDataChangeDisposable {
    this.#listeners.add(listener);

    return {
      dispose: () => {
        this.#listeners.delete(listener);
      },
    };
  }

  fire(element?: FlowguardTreeItem): void {
    for (const listener of this.#listeners) {
      listener(element);
    }
  }
}

export class FlowguardTreeDataProvider implements TreeDataProviderLike<FlowguardTreeItem> {
  #snapshot: FlowguardWorkspaceSnapshot | undefined;
  #options: FlowTreeOptions;
  readonly #changes = new TreeDataChangeEmitter();
  readonly onDidChangeTreeData = this.#changes.event.bind(this.#changes);

  constructor(snapshot?: FlowguardWorkspaceSnapshot, options: FlowTreeOptions = {}) {
    this.#snapshot = snapshot;
    this.#options = options;
  }

  updateSnapshot(snapshot: FlowguardWorkspaceSnapshot | undefined): void {
    this.#snapshot = snapshot;
    this.#changes.fire();
  }

  updateOptions(options: FlowTreeOptions): void {
    this.#options = options;
    this.#changes.fire();
  }

  getTreeItem(element: FlowguardTreeItem): FlowguardTreeItem {
    return element;
  }

  getChildren(element?: FlowguardTreeItem): readonly FlowguardTreeItem[] {
    if (element !== undefined) return [];
    return createFlowTreeItems(this.#snapshot, this.#options);
  }
}

export class FlowguardProposalTreeDataProvider implements TreeDataProviderLike<FlowguardTreeItem> {
  #snapshot: FlowguardWorkspaceSnapshot | undefined;
  readonly #changes = new TreeDataChangeEmitter();
  readonly onDidChangeTreeData = this.#changes.event.bind(this.#changes);

  constructor(snapshot?: FlowguardWorkspaceSnapshot) {
    this.#snapshot = snapshot;
  }

  updateSnapshot(snapshot: FlowguardWorkspaceSnapshot | undefined): void {
    this.#snapshot = snapshot;
    this.#changes.fire();
  }

  getTreeItem(element: FlowguardTreeItem): FlowguardTreeItem {
    return element;
  }

  getChildren(element?: FlowguardTreeItem): readonly FlowguardTreeItem[] {
    if (element !== undefined) return [];
    return createProposalTreeItems(this.#snapshot);
  }
}

export interface RegisteredFlowguardTreeProviders {
  readonly flows: FlowguardTreeDataProvider;
  readonly proposals: FlowguardProposalTreeDataProvider;
}

export const registerFlowguardTreeViews = (
  api: FlowguardHostApi,
  services: FlowguardServiceContainer,
  snapshot?: FlowguardWorkspaceSnapshot,
): RegisteredFlowguardTreeProviders => {
  const flows = new FlowguardTreeDataProvider(snapshot);
  const proposals = new FlowguardProposalTreeDataProvider(snapshot);

  services.addDisposable(
    api.window.createTreeView(FLOWGUARD_VIEWS.flows, {
      treeDataProvider: flows,
    }),
  );
  services.addDisposable(
    api.window.createTreeView(FLOWGUARD_VIEWS.proposals, {
      treeDataProvider: proposals,
    }),
  );

  return { flows, proposals };
};
