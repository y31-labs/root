import { useEffect, useMemo, useRef } from 'react';
import { z } from 'zod';

import { useLocalApi } from '#/providers/local-api-provider';

const sandboxPluginRequestSchema = z.object({
  source: z.literal('y31-plugin-request'),
  requestId: z.string().min(1),
  call: z.record(z.string(), z.unknown()),
});

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const bridgeScript = `<script>
(() => {
  const pending = new Map();
  let sequence = 0;

  window.y31 = Object.freeze({
    invoke(call) {
      return new Promise((resolve, reject) => {
        if (pending.size >= 4) {
          reject(new Error('Too many plugin requests are already running.'));
          return;
        }

        const requestId = 'plugin-' + Date.now() + '-' + (++sequence);
        const timeout = window.setTimeout(() => {
          pending.delete(requestId);
          reject(new Error('Plugin request timed out.'));
        }, 30000);

        pending.set(requestId, { resolve, reject, timeout });
        window.parent.postMessage({ source: 'y31-plugin-request', requestId, call }, '*');
      });
    }
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.source !== 'y31-plugin-response') return;
    const request = pending.get(event.data.requestId);
    if (!request) return;

    window.clearTimeout(request.timeout);
    pending.delete(event.data.requestId);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve(event.data.result);
  });
})();
</script>`;

export const createSandboxDocument = (title: string, html: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src data:;" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      html, body { min-height: 100%; margin: 0; background: #050505; color: #f5f5f5; }
      button, input, select, textarea { font: inherit; }
    </style>
    ${bridgeScript}
  </head>
  <body>${html}</body>
</html>`;

export function GeneratedAppSandbox({ title, html }: { title: string; html: string }) {
  const api = useLocalApi();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const document = useMemo(() => createSandboxDocument(title, html), [html, title]);

  useEffect(() => {
    const handlePluginRequest = async (event: MessageEvent<unknown>) => {
      const frameWindow = frameRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;

      const request = sandboxPluginRequestSchema.safeParse(event.data);
      if (!request.success) return;

      try {
        const result = await api.runPlugin(request.data.call);
        frameWindow.postMessage(
          { source: 'y31-plugin-response', requestId: request.data.requestId, result },
          '*',
        );
      } catch (error) {
        frameWindow.postMessage(
          {
            source: 'y31-plugin-response',
            requestId: request.data.requestId,
            error: error instanceof Error ? error.message : 'Plugin request failed.',
          },
          '*',
        );
      }
    };

    window.addEventListener('message', handlePluginRequest);
    return () => window.removeEventListener('message', handlePluginRequest);
  }, [api]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      srcDoc={document}
      sandbox='allow-scripts'
      className='h-full w-full border-0 bg-background'
      data-testid='generated-app-sandbox'
    />
  );
}
