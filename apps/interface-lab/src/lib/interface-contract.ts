import { z } from 'zod';

export const generatedAppSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(300),
  html: z.string().min(1).max(60_000),
});

export const interfaceRequestSchema = z.object({
  brief: z.string().trim().min(8).max(2000),
  currentApp: generatedAppSchema.optional(),
});

export const interfaceBackendSchema = z.object({
  kind: z.literal('gateway'),
  detail: z.string().min(1),
});

export const generatedInterfaceSchema = generatedAppSchema.extend({
  backend: interfaceBackendSchema,
});

export type InterfaceRequest = z.infer<typeof interfaceRequestSchema>;
export type GeneratedApp = z.infer<typeof generatedAppSchema>;
export type GeneratedInterface = z.infer<typeof generatedInterfaceSchema>;
