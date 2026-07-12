import {
  generatedInterfaceSchema,
  type GeneratedApp,
  type GeneratedInterface,
} from '#/lib/interface-contract';

const isErrorResponse = (body: unknown): body is { error: string } =>
  typeof body === 'object' &&
  body !== null &&
  'error' in body &&
  typeof (body as { error?: unknown }).error === 'string';

export const generateInterface = async (
  brief: string,
  currentApp?: GeneratedApp,
): Promise<GeneratedInterface> => {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief, currentApp }),
  });
  const body = (await response.json()) as unknown;

  if (!response.ok || isErrorResponse(body)) {
    throw new Error(isErrorResponse(body) ? body.error : 'Generation failed.');
  }

  return generatedInterfaceSchema.parse(body);
};
