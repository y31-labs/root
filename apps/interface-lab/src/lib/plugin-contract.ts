import { z } from 'zod';

export const repositoryRankingSchema = z.enum(['stars', 'forks', 'updated', 'size']);

export const weatherPluginCallSchema = z
  .object({
    plugin: z.literal('open-meteo'),
    input: z
      .object({
        location: z.string().trim().min(2).max(120),
        days: z.number().int().min(3).max(7),
      })
      .strict(),
  })
  .strict();

export const githubPluginCallSchema = z
  .object({
    plugin: z.literal('github'),
    input: z
      .object({
        query: z.string().trim().max(80),
        ranking: repositoryRankingSchema,
        limit: z.number().int().min(5).max(20),
      })
      .strict(),
  })
  .strict();

// A regular union emits JSON Schema `anyOf`, which is supported by the
// gateway's strict structured-output subset. A discriminated union emits
// `oneOf` and causes the structured-output finalizer to return no result.
export const pluginCallSchema = z.union([weatherPluginCallSchema, githubPluginCallSchema]);

export const weatherForecastPrimitiveSchema = z.object({
  plugin: z.literal('open-meteo'),
  kind: z.literal('weather-forecast'),
  location: z.string().min(1),
  timezone: z.string().min(1),
  days: z.array(
    z.object({
      date: z.string().min(1),
      condition: z.string().min(1),
      temperatureMin: z.number(),
      temperatureMax: z.number(),
      precipitationProbability: z.number().min(0).max(100),
    }),
  ),
});

export const githubRepositoryPrimitiveSchema = z.object({
  fullName: z.string().min(1),
  description: z.string().nullable(),
  url: z.string().url(),
  stars: z.number().int().nonnegative(),
  forks: z.number().int().nonnegative(),
  openIssues: z.number().int().nonnegative(),
  sizeKb: z.number().int().nonnegative(),
  language: z.string().nullable(),
  updatedAt: z.string().min(1),
});

export const githubRepositoryListPrimitiveSchema = z.object({
  plugin: z.literal('github'),
  kind: z.literal('repository-list'),
  query: z.string(),
  ranking: repositoryRankingSchema,
  totalCount: z.number().int().nonnegative(),
  scope: z.string().min(1),
  repositories: z.array(githubRepositoryPrimitiveSchema),
});

export const pluginPrimitiveSchema = z.discriminatedUnion('kind', [
  weatherForecastPrimitiveSchema,
  githubRepositoryListPrimitiveSchema,
]);

export type PluginCall = z.infer<typeof pluginCallSchema>;
export type PluginPrimitive = z.infer<typeof pluginPrimitiveSchema>;
export type WeatherForecastPrimitive = z.infer<typeof weatherForecastPrimitiveSchema>;
export type GithubRepositoryListPrimitive = z.infer<typeof githubRepositoryListPrimitiveSchema>;
export type RepositoryRanking = z.infer<typeof repositoryRankingSchema>;
