import { randomBytes } from 'node:crypto';

import { flowguardMessageProtocol, flowguardMessageVersion } from '#/shared/messages';

export interface FlowguardWebviewHtmlOptions {
  readonly cspSource: string;
  readonly nonce?: string;
  readonly title?: string;
  readonly scriptUri?: string;
  readonly styleUri?: string;
}

export const createFlowguardWebviewNonce = (): string => {
  return randomBytes(16).toString('base64url');
};

export const createFlowguardWebviewCsp = (options: {
  readonly cspSource: string;
  readonly nonce: string;
  readonly hasStyleUri?: boolean;
}): string => {
  const styleSource = options.hasStyleUri ? options.cspSource : "'none'";

  return [
    "default-src 'none'",
    `img-src ${options.cspSource} data:`,
    `font-src ${options.cspSource}`,
    `style-src ${styleSource}`,
    `script-src 'nonce-${options.nonce}'`,
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
};

export const createFlowguardWebviewHtml = (options: FlowguardWebviewHtmlOptions): string => {
  const nonce = options.nonce ?? createFlowguardWebviewNonce();
  const title = options.title ?? 'Flowguard';
  const csp = createFlowguardWebviewCsp({
    cspSource: options.cspSource,
    nonce,
    hasStyleUri: options.styleUri !== undefined,
  });
  const styleTag =
    options.styleUri === undefined
      ? ''
      : `<link rel="stylesheet" nonce="${escapeHtmlAttribute(nonce)}" href="${escapeHtmlAttribute(
          options.styleUri,
        )}">`;
  const scriptTag =
    options.scriptUri === undefined
      ? ''
      : `<script nonce="${escapeHtmlAttribute(nonce)}" src="${escapeHtmlAttribute(
          options.scriptUri,
        )}"></script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(csp)}">
  <title>${escapeHtmlText(title)}</title>
  ${styleTag}
</head>
<body>
  <main id="flowguard-root"></main>
  <script nonce="${escapeHtmlAttribute(nonce)}">
    (() => {
      const vscode = acquireVsCodeApi();
      globalThis.flowguardVsCode = vscode;
      vscode.postMessage({
        protocol: ${JSON.stringify(flowguardMessageProtocol)},
        version: ${flowguardMessageVersion},
        type: 'webview/ready',
        payload: {}
      });
    })();
  </script>
  ${scriptTag}
</body>
</html>`;
};

const escapeHtmlAttribute = (value: string): string => {
  return value.replace(/[&<>"']/gu, (character) => htmlEscapes[character] ?? character);
};

const escapeHtmlText = (value: string): string => {
  return value.replace(/[&<>]/gu, (character) => htmlEscapes[character] ?? character);
};

const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
