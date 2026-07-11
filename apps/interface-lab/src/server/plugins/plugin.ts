import type { z } from 'zod';

import type { PluginCall, PluginPrimitive } from '#/lib/plugin-contract';

type PluginDefinition<TInput> = {
  id: PluginCall['plugin'];
  name: string;
  description: string;
  inputDescription: string;
  resultDescription: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput) => Promise<PluginPrimitive>;
};

export type SurfacePlugin = Omit<PluginDefinition<unknown>, 'inputSchema' | 'execute'> & {
  execute: (input: unknown) => Promise<PluginPrimitive>;
};

export const definePlugin = <TInput>(definition: PluginDefinition<TInput>): SurfacePlugin => ({
  id: definition.id,
  name: definition.name,
  description: definition.description,
  inputDescription: definition.inputDescription,
  resultDescription: definition.resultDescription,
  execute: async (input) => definition.execute(definition.inputSchema.parse(input)),
});
