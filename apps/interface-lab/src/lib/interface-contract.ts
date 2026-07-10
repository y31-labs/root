import { z } from 'zod';

export const interfaceRequestSchema = z.object({
  brief: z.string().trim().min(8).max(2000),
});

export const itemToneSchema = z.enum(['neutral', 'success', 'warning', 'danger']);

export const generatedItemSchema = z.object({
  primary: z.string().min(1),
  secondary: z.string().optional(),
  meta: z.array(z.string()).default([]),
  tone: itemToneSchema.default('neutral'),
});

export const generatedSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(['decision', 'timeline', 'checklist', 'options', 'sandbox']),
  items: z.array(generatedItemSchema).min(1),
});

export const generatedControlSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['toggle', 'select', 'stepper']),
  value: z.string().min(1),
  options: z.array(z.string()).optional(),
});

export const generatedActionSchema = z.object({
  label: z.string().min(1),
  intent: z.string().min(1),
  tone: itemToneSchema.default('neutral'),
});

export const sandboxTargetSchema = z.object({
  provider: z.literal('vercel-sandbox'),
  runtime: z.literal('node24'),
  port: z.number().int().positive(),
  command: z.string().min(1),
  previewPath: z.string().min(1),
});

export const generatedInterfaceSchema = z.object({
  title: z.string().min(1),
  domain: z.enum(['travel', 'planning', 'support', 'operations']),
  intent: z.string().min(1),
  summary: z.string().min(1),
  backend: z.object({
    kind: z.enum(['codex', 'fallback']),
    detail: z.string().min(1),
  }),
  controls: z.array(generatedControlSchema).min(1),
  sections: z.array(generatedSectionSchema).min(1),
  actions: z.array(generatedActionSchema).min(1),
  sandbox: sandboxTargetSchema,
});

export type InterfaceRequest = z.infer<typeof interfaceRequestSchema>;
export type GeneratedInterface = z.infer<typeof generatedInterfaceSchema>;
export type GeneratedControl = z.infer<typeof generatedControlSchema>;
export type GeneratedSection = z.infer<typeof generatedSectionSchema>;
export type GeneratedItem = z.infer<typeof generatedItemSchema>;

const generatedItemJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['primary', 'secondary', 'meta', 'tone'],
  properties: {
    primary: { type: 'string', minLength: 1 },
    secondary: { type: 'string' },
    meta: { type: 'array', items: { type: 'string' } },
    tone: { type: 'string', enum: ['neutral', 'success', 'warning', 'danger'] },
  },
};

export const generatedInterfaceJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'domain',
    'intent',
    'summary',
    'backend',
    'controls',
    'sections',
    'actions',
    'sandbox',
  ],
  properties: {
    title: { type: 'string', minLength: 1 },
    domain: { type: 'string', enum: ['travel', 'planning', 'support', 'operations'] },
    intent: { type: 'string', minLength: 1 },
    summary: { type: 'string', minLength: 1 },
    backend: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'detail'],
      properties: {
        kind: { type: 'string', enum: ['codex', 'fallback'] },
        detail: { type: 'string', minLength: 1 },
      },
    },
    controls: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'type', 'value', 'options'],
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          type: { type: 'string', enum: ['toggle', 'select', 'stepper'] },
          value: { type: 'string', minLength: 1 },
          options: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    sections: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'kind', 'items'],
        properties: {
          id: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1 },
          kind: {
            type: 'string',
            enum: ['decision', 'timeline', 'checklist', 'options', 'sandbox'],
          },
          items: { type: 'array', minItems: 1, items: generatedItemJsonSchema },
        },
      },
    },
    actions: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'intent', 'tone'],
        properties: {
          label: { type: 'string', minLength: 1 },
          intent: { type: 'string', minLength: 1 },
          tone: { type: 'string', enum: ['neutral', 'success', 'warning', 'danger'] },
        },
      },
    },
    sandbox: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'runtime', 'port', 'command', 'previewPath'],
      properties: {
        provider: { type: 'string', enum: ['vercel-sandbox'] },
        runtime: { type: 'string', enum: ['node24'] },
        port: { type: 'integer' },
        command: { type: 'string', minLength: 1 },
        previewPath: { type: 'string', minLength: 1 },
      },
    },
  },
};
