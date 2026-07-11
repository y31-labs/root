import { chat, type AnyTextAdapter } from '@tanstack/ai';
import { openaiCompatible } from '@tanstack/ai-openai/compatible';

import {
  generatedInterfaceSchema,
  generatedSurfaceSchema,
  type GeneratedInterface,
  type InterfaceRequest,
} from '#/lib/interface-contract';

// This model is currently available to Vercel AI Gateway's free tier and
// supports the Responses API required for structured interface generation.
const INTERFACE_MODEL = 'openai/gpt-5.4-mini';

const systemPrompt = `You design focused, task-specific interfaces for Y31.

Return a single interface specification that matches the supplied schema exactly.

Rules:
- Design around the user's real job to be done, not a chat transcript.
- Use concise, practical text. Never invent completed work, live prices, bookings, or external data.
- Choose only controls, sections, and actions that make the next decision or action easier.
- Keep the surface small: two or three controls, two to four sections, and two or three actions.
- Every section and action must be understandable without a follow-up explanation.
- Do not return code, HTML, URLs, shell commands, runtime details, model details, or deployment instructions.`;

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

  const surface = await chat({
    adapter,
    systemPrompts: [systemPrompt],
    messages: [{ role: 'user', content: brief }],
    outputSchema: generatedSurfaceSchema,
    modelOptions: {
      max_output_tokens: 1800,
      providerOptions: {
        gateway: {
          disallowPromptTraining: true,
        },
      },
    },
  });

  return generatedInterfaceSchema.parse({
    ...surface,
    backend: {
      kind: 'gateway',
      detail: 'Generated through Vercel AI Gateway.',
    },
  }) satisfies GeneratedInterface;
};
