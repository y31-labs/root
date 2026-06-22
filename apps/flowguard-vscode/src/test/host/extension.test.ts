import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { ExtensionContext } from 'vscode';

import { FLOWGUARD_COMMANDS, FLOWGUARD_VIEWS } from '#/extension/services/constants';
import type { TreeViewOptionsLike } from '#/extension/services/host-api';
import type { WorkspaceFolderLike } from '#/extension/services/service-container';

interface RegisteredCommand {
  readonly command: string;
  readonly handler: (...args: unknown[]) => unknown;
}

interface RegisteredView {
  readonly viewId: string;
  readonly options: TreeViewOptionsLike<unknown>;
}

interface TrackedDisposable {
  readonly label: string;
  disposed: boolean;
  disposeCalls: number;
  dispose(): void;
}

interface ActivatedContainer {
  readonly isDisposed: boolean;
  readonly repositoryCount: number;
  readonly repositories: readonly {
    readonly repositoryUri: string;
    readonly isDisposed: boolean;
  }[];
}

let workspaceFolders: readonly WorkspaceFolderLike[] | undefined;
let registeredCommands: RegisteredCommand[] = [];
let registeredViews: RegisteredView[] = [];
let trackedDisposables: TrackedDisposable[] = [];
let informationMessages: string[] = [];

mock.module('vscode', () => ({
  commands: {
    registerCommand: (command: string, handler: (...args: unknown[]) => unknown) => {
      registeredCommands.push({ command, handler });
      return createTrackedDisposable(`command:${command}`);
    },
  },
  window: {
    createTreeView: <T>(viewId: string, options: TreeViewOptionsLike<T>) => {
      registeredViews.push({ viewId, options: options as TreeViewOptionsLike<unknown> });
      return createTrackedDisposable(`view:${viewId}`);
    },
    showInformationMessage: (message: string) => {
      informationMessages.push(message);
      return Promise.resolve(undefined);
    },
  },
  workspace: {
    get workspaceFolders() {
      return workspaceFolders;
    },
  },
}));

const extension = await import('../../extension');

describe('Flowguard extension host skeleton', () => {
  beforeEach(() => {
    extension.deactivate();
    workspaceFolders = [createWorkspaceFolder('file:///workspace', 'workspace', 0)];
    registeredCommands = [];
    registeredViews = [];
    trackedDisposables = [];
    informationMessages = [];
  });

  test('registers placeholder commands and providers with disposable ownership', async () => {
    const context = createContext();

    extension.activate(context as ExtensionContext);

    expect(context.subscriptions).toHaveLength(1);
    const container = context.subscriptions[0] as unknown as ActivatedContainer;
    expect(container.repositoryCount).toBe(1);
    expect(container.repositories[0]?.repositoryUri).toBe('file:///workspace');
    expect(registeredCommands.map((entry) => entry.command)).toEqual(
      Object.values(FLOWGUARD_COMMANDS),
    );
    expect(registeredViews.map((entry) => entry.viewId)).toEqual(Object.values(FLOWGUARD_VIEWS));

    const flowView = findView(FLOWGUARD_VIEWS.flows);
    await expect(Promise.resolve(flowView.options.treeDataProvider.getChildren())).resolves.toEqual(
      [
        {
          label: 'Flow discovery placeholder',
          description: '1 workspace',
          contextValue: 'flowguard.placeholder',
        },
      ],
    );

    const refreshCommand = findCommand(FLOWGUARD_COMMANDS.refresh);
    await refreshCommand.handler();
    expect(informationMessages).toEqual([
      'Flowguard refresh will be enabled after workspace discovery lands.',
    ]);

    extension.deactivate();
    extension.deactivate();

    expect(container.isDisposed).toBe(true);
    expect(container.repositories[0]?.isDisposed).toBe(true);
    expect(trackedDisposables).toHaveLength(
      Object.values(FLOWGUARD_COMMANDS).length + Object.values(FLOWGUARD_VIEWS).length,
    );
    expect(trackedDisposables.every((disposable) => disposable.disposed)).toBe(true);
    expect(trackedDisposables.every((disposable) => disposable.disposeCalls === 1)).toBe(true);
  });

  test('keeps activation useful without an open workspace', async () => {
    workspaceFolders = undefined;
    const context = createContext();

    extension.activate(context as ExtensionContext);

    const container = context.subscriptions[0] as unknown as ActivatedContainer;
    expect(container.repositoryCount).toBe(0);

    const proposalView = findView(FLOWGUARD_VIEWS.proposals);
    await expect(
      Promise.resolve(proposalView.options.treeDataProvider.getChildren()),
    ).resolves.toEqual([
      {
        label: 'Open a workspace to use Flowguard',
        contextValue: 'flowguard.placeholder',
      },
    ]);

    extension.deactivate();
    expect(container.isDisposed).toBe(true);
  });
});

const createContext = (): Pick<ExtensionContext, 'subscriptions'> => {
  return { subscriptions: [] };
};

const createWorkspaceFolder = (uri: string, name: string, index: number): WorkspaceFolderLike => {
  return {
    uri: {
      toString: () => uri,
    },
    name,
    index,
  };
};

const createTrackedDisposable = (label: string): TrackedDisposable => {
  const disposable: TrackedDisposable = {
    label,
    disposed: false,
    disposeCalls: 0,
    dispose() {
      this.disposed = true;
      this.disposeCalls += 1;
    },
  };

  trackedDisposables.push(disposable);

  return disposable;
};

const findCommand = (command: string): RegisteredCommand => {
  const match = registeredCommands.find((entry) => entry.command === command);

  if (match === undefined) {
    throw new Error(`Expected command ${command} to be registered.`);
  }

  return match;
};

const findView = (viewId: string): RegisteredView => {
  const match = registeredViews.find((entry) => entry.viewId === viewId);

  if (match === undefined) {
    throw new Error(`Expected view ${viewId} to be registered.`);
  }

  return match;
};
