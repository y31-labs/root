import * as vscode from 'vscode';

import { activateFlowguardHost } from '#/extension/services/host';
import type { FlowguardHostApi, TreeViewOptionsLike } from '#/extension/services/host-api';
import type { FlowguardServiceContainer } from '#/extension/services/service-container';

let activeServices: FlowguardServiceContainer | undefined;

export const activate = (context: vscode.ExtensionContext): void => {
  activeServices?.dispose();
  activeServices = activateFlowguardHost(createVsCodeHostApi(), context);
};

export const deactivate = (): void => {
  activeServices?.dispose();
  activeServices = undefined;
};

const createVsCodeHostApi = (): FlowguardHostApi => {
  return {
    commands: {
      registerCommand: (command, handler) => vscode.commands.registerCommand(command, handler),
    },
    window: {
      createTreeView: (viewId, options) => createTreeView(viewId, options),
      showInformationMessage: (message) => vscode.window.showInformationMessage(message),
    },
    workspace: {
      workspaceFolders: vscode.workspace.workspaceFolders,
    },
  };
};

const createTreeView = <T>(viewId: string, options: TreeViewOptionsLike<T>): vscode.Disposable => {
  return vscode.window.createTreeView(viewId, {
    treeDataProvider: options.treeDataProvider as vscode.TreeDataProvider<T>,
    showCollapseAll: options.showCollapseAll,
  });
};
