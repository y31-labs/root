import { chat, type AnyTextAdapter } from '@tanstack/ai';
import { openaiCompatible } from '@tanstack/ai-openai/compatible';

import {
  generatedAppSchema,
  generatedInterfaceSchema,
  type GeneratedInterface,
  type InterfaceRequest,
} from '#/lib/interface-contract';
import { pluginCatalog } from '#/server/plugins/registry';

const INTERFACE_MODEL = 'openai/gpt-5.4-mini';

const systemPrompt = `You build a new, focused web application for every Y31 user request.

Return a title, a short description, and one self-contained HTML fragment. Y31 runs the fragment in an isolated browser sandbox and injects the plugin runtime before your code executes.

Application rules:
- Build the actual application the user asked for, not a generic dashboard, wireframe, plan, or prose explanation.
- The HTML must include all markup, CSS in a <style> tag, and vanilla JavaScript in a <script> tag. Do not include <html>, <head>, or <body> wrappers.
- Use semantic HTML and polished, responsive layout. The sandbox is 900px wide on desktop and may be narrow on mobile.
- Include the application title and task context in the visible interface.
- Use a quiet dark visual direction: near-black background, high-contrast text, subtle borders, clear spacing, and restrained accent colors.
- Every visible control must work. Keep application state in JavaScript and update the existing DOM; never request a new generated interface.
- Fetch live data only through the installed plugin runtime below. Call it on initial load when live data is needed, show loading and error states, and call it again when relevant controls change.
- You may filter, sort, aggregate, and transform returned plugin data inside the sandbox.
- Never invent API results, completed work, repository names, weather values, rankings, prices, or bookings. Empty and unsupported states must be explicit.
- Do not use fetch, XMLHttpRequest, WebSocket, external scripts, external stylesheets, modules, navigation, popups, forms that navigate, or Markdown fences.
- Links to URLs returned by a plugin may use target="_blank", though the sandbox may prevent opening them.
- Escape user-derived text before inserting it with innerHTML, or prefer textContent and DOM construction.

Injected runtime:
- window.y31.invoke(call) returns a Promise with validated plugin data.
- The only allowed calls are listed below. Do not call an unlisted plugin or add fields not shown.

Installed plugins:
${pluginCatalog}`;

const getGatewayCredential = () => {
  const credential = process.env.VERCEL_OIDC_TOKEN ?? process.env.AI_GATEWAY_API_KEY;
  if (!credential) {
    throw new Error(
      'Vercel AI Gateway authentication is unavailable. Run the app through its linked Vercel project.',
    );
  }
  return credential;
};

const createGateway = () =>
  openaiCompatible({
    name: 'vercel-ai-gateway',
    baseURL: 'https://ai-gateway.vercel.sh/v1',
    apiKey: getGatewayCredential(),
    api: 'responses',
    models: [INTERFACE_MODEL] as const,
  });

export const generateGatewayInterface = async ({ brief }: InterfaceRequest) => {
  const gateway = createGateway();
  const adapter = gateway(INTERFACE_MODEL) as AnyTextAdapter;
  const app = await chat({
    adapter,
    systemPrompts: [systemPrompt],
    messages: [{ role: 'user', content: brief }],
    outputSchema: generatedAppSchema,
    modelOptions: {
      max_output_tokens: 6000,
      providerOptions: {
        gateway: { disallowPromptTraining: true },
      },
    },
  });

  return generatedInterfaceSchema.parse({
    ...app,
    backend: {
      kind: 'gateway',
      detail: 'Application generated through Vercel AI Gateway and isolated in the Y31 sandbox.',
    },
  }) satisfies GeneratedInterface;
};
