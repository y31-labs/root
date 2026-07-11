import {
  pluginPrimitiveSchema,
  type PluginCall,
  type PluginPrimitive,
} from '#/lib/plugin-contract';

const isErrorResponse = (body: unknown): body is { error: string } =>
  typeof body === 'object' &&
  body !== null &&
  'error' in body &&
  typeof (body as { error?: unknown }).error === 'string';

export const runPlugin = async (call: PluginCall): Promise<PluginPrimitive> => {
  const response = await fetch('/api/plugins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(call),
  });
  const body = (await response.json()) as unknown;

  if (!response.ok || isErrorResponse(body)) {
    throw new Error(isErrorResponse(body) ? body.error : 'Unable to update app data.');
  }

  return pluginPrimitiveSchema.parse(body);
};
