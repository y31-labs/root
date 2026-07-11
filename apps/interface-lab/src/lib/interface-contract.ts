import { z } from 'zod';

export const interfaceRequestSchema = z.object({
  brief: z.string().trim().min(8).max(2000),
});

export const itemToneSchema = z.enum(['neutral', 'success', 'warning', 'danger']);

export const generatedItemSchema = z.object({
  primary: z.string().min(1),
  secondary: z.string().min(1),
  meta: z.array(z.string()),
  tone: itemToneSchema,
});

export const generatedSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(['decision', 'timeline', 'checklist', 'options']),
  items: z.array(generatedItemSchema).min(1),
});

export const generatedControlSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['toggle', 'select', 'stepper']),
  value: z.string().min(1),
  options: z.array(z.string()),
});

export const generatedActionSchema = z.object({
  label: z.string().min(1),
  intent: z.string().min(1),
  tone: itemToneSchema,
});

/** The only portion of a surface the model is allowed to determine. */
export const generatedSurfaceSchema = z.object({
  title: z.string().min(1),
  domain: z.enum(['travel', 'planning', 'support', 'operations']),
  intent: z.string().min(1),
  summary: z.string().min(1),
  controls: z.array(generatedControlSchema).min(1),
  sections: z.array(generatedSectionSchema).min(1),
  actions: z.array(generatedActionSchema).min(1),
});

export const interfaceBackendSchema = z.object({
  kind: z.literal('gateway'),
  detail: z.string().min(1),
});

export const generatedInterfaceSchema = generatedSurfaceSchema.extend({
  backend: interfaceBackendSchema,
});

export type InterfaceRequest = z.infer<typeof interfaceRequestSchema>;
export type GeneratedSurface = z.infer<typeof generatedSurfaceSchema>;
export type GeneratedInterface = z.infer<typeof generatedInterfaceSchema>;
export type GeneratedControl = z.infer<typeof generatedControlSchema>;
export type GeneratedSection = z.infer<typeof generatedSectionSchema>;
export type GeneratedItem = z.infer<typeof generatedItemSchema>;
