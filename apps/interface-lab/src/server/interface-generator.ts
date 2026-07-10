import { interfaceRequestSchema, type GeneratedInterface } from '#/lib/interface-contract';
import { runCodexInterfaceGenerator } from '#/server/codex-interface';
import { buildFallbackInterface } from '#/server/fallback-interface';

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
        'A ready-to-use surface was assembled from your brief.',
      );
    }
  }

  return buildFallbackInterface(request);
};
