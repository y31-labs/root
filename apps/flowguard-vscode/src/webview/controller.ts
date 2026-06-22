/// <reference lib="dom" />

import {
  flowguardMessageProtocol,
  flowguardMessageVersion,
  parseFlowguardHostToWebviewMessage,
  type FlowguardHostToWebviewMessage,
  type FlowguardWebviewToHostMessage,
} from '#/shared/messages';
import { createDefaultGraphViewport, type GraphViewport } from '#/webview/layout';
import { clamp } from '#/webview/math';
import { renderFlowguardGraphWebview } from '#/webview/render';
import {
  createFlowguardGraphViewModel,
  createRevealSourceIntent,
  nextSearchSelection,
  type FlowguardGraphViewModel,
  type GraphWebviewState,
} from '#/webview/view-model';

export interface FlowguardVsCodeApi {
  postMessage(message: unknown): void;
}

export interface FlowguardGraphWebviewControllerOptions {
  readonly root: HTMLElement;
  readonly vscode: FlowguardVsCodeApi;
  readonly windowObject?: Window;
  readonly postReady?: boolean;
}

export interface FlowguardGraphWebviewController {
  readonly currentModel: FlowguardGraphViewModel;
  dispose(): void;
}

declare global {
  interface Window {
    flowguardVsCode?: FlowguardVsCodeApi;
    acquireVsCodeApi?: () => FlowguardVsCodeApi;
  }
}

export const createFlowguardGraphWebviewController = (
  options: FlowguardGraphWebviewControllerOptions,
): FlowguardGraphWebviewController => {
  const windowObject = options.windowObject ?? window;
  let state: GraphWebviewState = {};
  let model = createFlowguardGraphViewModel(state);
  let currentOpenKey = openKey(state);

  const render = (): void => {
    model = createFlowguardGraphViewModel(state);
    renderFlowguardGraphWebview(options.root, model, {
      fit: () => {
        state = {
          ...state,
          viewport: createDefaultGraphViewport(),
        };
        render();
      },
      zoomIn: () => {
        state = {
          ...state,
          viewport: zoomViewport(state.viewport, 1.2),
        };
        render();
      },
      zoomOut: () => {
        state = {
          ...state,
          viewport: zoomViewport(state.viewport, 1 / 1.2),
        };
        render();
      },
      search: (query) => {
        const nextState = {
          ...state,
          searchQuery: query,
        };
        const nextModel = createFlowguardGraphViewModel(nextState);
        state = {
          ...nextState,
          selectedItemKey: nextSearchSelection(nextModel, state.selectedItemKey, 1),
        };
        render();
      },
      select: (key) => {
        state = {
          ...state,
          selectedItemKey: key,
        };
        render();
      },
      revealSource: (key, sourcePath) => {
        const item = model.items.find((candidate) => candidate.key === key);
        if (model.document === undefined || item === undefined) return;
        postWebviewMessage(options.vscode, {
          protocol: flowguardMessageProtocol,
          version: flowguardMessageVersion,
          type: 'intent/reveal-source',
          payload: createRevealSourceIntent(model.document, item, sourcePath),
        });
      },
    });
  };

  const messageListener = (event: MessageEvent<unknown>): void => {
    handleHostMessage(event.data);
  };

  const handleHostMessage = (message: unknown): void => {
    const validation = parseFlowguardHostToWebviewMessage(message);
    if (!validation.ok) return;

    state = reduceHostMessage(state, validation.value);
    const nextOpenKey = openKey(state);
    if (nextOpenKey !== currentOpenKey) {
      currentOpenKey = nextOpenKey;
      state = {
        ...state,
        selectedItemKey: undefined,
        viewport: createDefaultGraphViewport(),
      };
    }
    render();
  };

  windowObject.addEventListener('message', messageListener);
  render();

  if (options.postReady === true) {
    postWebviewMessage(options.vscode, {
      protocol: flowguardMessageProtocol,
      version: flowguardMessageVersion,
      type: 'webview/ready',
      payload: {},
    });
  }

  return {
    get currentModel() {
      return model;
    },
    dispose: () => {
      windowObject.removeEventListener('message', messageListener);
    },
  };
};

export const startFlowguardGraphWebview = (
  rootId = 'flowguard-root',
): FlowguardGraphWebviewController => {
  const root = document.getElementById(rootId);
  if (root === null) {
    throw new Error(`Flowguard root element "${rootId}" was not found.`);
  }

  const vscode = window.flowguardVsCode ?? window.acquireVsCodeApi?.();
  if (vscode === undefined) {
    throw new Error('Flowguard VS Code API is not available.');
  }

  return createFlowguardGraphWebviewController({
    root,
    vscode,
  });
};

const reduceHostMessage = (
  state: GraphWebviewState,
  message: FlowguardHostToWebviewMessage,
): GraphWebviewState => {
  switch (message.type) {
    case 'host/snapshot':
      return {
        ...state,
        snapshot: message.payload,
        hostError: undefined,
      };
    case 'host/open':
      return {
        ...state,
        open: message.payload,
        hostError: undefined,
      };
    case 'host/error':
      return {
        ...state,
        hostError: message.payload.message,
      };
  }
};

const postWebviewMessage = (
  vscode: FlowguardVsCodeApi,
  message: FlowguardWebviewToHostMessage,
): void => {
  vscode.postMessage(message);
};

const zoomViewport = (viewport: GraphViewport | undefined, factor: number): GraphViewport => {
  const current = viewport ?? createDefaultGraphViewport();
  return {
    ...current,
    zoom: clamp(current.zoom * factor, 0.25, 3),
  };
};

const openKey = (state: GraphWebviewState): string => {
  return [state.open?.rootUri ?? '', state.open?.flowId ?? '', state.open?.proposalId ?? ''].join(
    '\0',
  );
};
