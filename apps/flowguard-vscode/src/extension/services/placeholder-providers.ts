import { FLOWGUARD_VIEWS } from '#/extension/services/constants';
import type {
  FlowguardHostApi,
  TreeDataProviderLike,
  TreeItemLike,
} from '#/extension/services/host-api';
import type { FlowguardServiceContainer } from '#/extension/services/service-container';

interface PlaceholderTreeItem extends TreeItemLike {
  readonly contextValue: 'flowguard.placeholder';
}

class PlaceholderTreeDataProvider implements TreeDataProviderLike<PlaceholderTreeItem> {
  constructor(
    private readonly services: FlowguardServiceContainer,
    private readonly workspaceLabel: string,
  ) {}

  getTreeItem(element: PlaceholderTreeItem): TreeItemLike {
    return element;
  }

  getChildren(): readonly PlaceholderTreeItem[] {
    if (this.services.repositoryCount === 0) {
      return [
        {
          label: 'Open a workspace to use Flowguard',
          contextValue: 'flowguard.placeholder',
        },
      ];
    }

    return [
      {
        label: this.workspaceLabel,
        description: formatWorkspaceCount(this.services.repositoryCount),
        contextValue: 'flowguard.placeholder',
      },
    ];
  }
}

export const registerPlaceholderProviders = (
  api: FlowguardHostApi,
  services: FlowguardServiceContainer,
): void => {
  services.addDisposable(
    api.window.createTreeView(FLOWGUARD_VIEWS.flows, {
      treeDataProvider: new PlaceholderTreeDataProvider(services, 'Flow discovery placeholder'),
    }),
  );

  services.addDisposable(
    api.window.createTreeView(FLOWGUARD_VIEWS.proposals, {
      treeDataProvider: new PlaceholderTreeDataProvider(services, 'Proposal discovery placeholder'),
    }),
  );
};

const formatWorkspaceCount = (count: number): string => {
  return count === 1 ? '1 workspace' : `${count} workspaces`;
};
