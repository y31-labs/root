import { ZodError } from 'zod';

import { interfaceRequestSchema, type GeneratedInterface } from '#/lib/interface-contract';
import { runCodexInterfaceGenerator } from '#/server/codex-interface';
import { buildFallbackInterface } from '#/server/fallback-interface';

const getErrorMessage = (error: unknown) => {
  if (error instanceof ZodError) return error.issues.map((issue) => issue.message).join(', ');
  if (error instanceof Error) return error.message;
  return 'Unknown error';
};

export const generateInterface = async (input: unknown): Promise<GeneratedInterface> => {
  const request = interfaceRequestSchema.parse(input);
  const backendMode = process.env.INTERFACE_LAB_BACKEND ?? 'auto';

  if (backendMode !== 'fallback') {
    try {
      return await runCodexInterfaceGenerator(request);
    } catch (error) {
      if (backendMode === 'codex') throw error;

      return buildFallbackInterface(
        request,
        `Codex unavailable; fallback used. ${getErrorMessage(error)}`,
      );
    }
  }

  return buildFallbackInterface(request);
};
