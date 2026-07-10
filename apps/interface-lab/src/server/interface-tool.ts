import { toolDefinition } from '@tanstack/ai';

import { interfaceRequestSchema } from '#/lib/interface-contract';

export const interfaceGeneratorToolName = 'generate_problem_interface';

export const interfaceGeneratorTool = toolDefinition({
  name: interfaceGeneratorToolName,
  description: 'Generate a structured, task-specific UI contract from a short user problem brief.',
  inputSchema: interfaceRequestSchema,
});
