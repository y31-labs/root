import { afterEach, describe, expect, it, vi } from 'vitest';

import { pluginCallSchema } from '#/lib/plugin-contract';
import { githubPlugin } from '#/server/plugins/github';
import { openMeteoPlugin } from '#/server/plugins/open-meteo';
import { executePluginCall, pluginCatalog } from '#/server/plugins/registry';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const requestUrl = (input: string | URL | Request) =>
  input instanceof Request ? input.url : input.toString();

const repository = (overrides: Record<string, unknown> = {}) => ({
  full_name: 'tanstack/ai',
  description: 'AI SDK for TypeScript.',
  html_url: 'https://github.com/tanstack/ai',
  stargazers_count: 1200,
  forks_count: 90,
  open_issues_count: 12,
  size: 2400,
  language: 'TypeScript',
  updated_at: '2026-07-10T12:00:00Z',
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sandbox plugins', () => {
  it('rejects fields outside the installed plugin contracts', () => {
    expect(
      pluginCallSchema.safeParse({
        plugin: 'github',
        input: { query: '', ranking: 'stars', limit: 10, arbitrary: true },
      }).success,
    ).toBe(false);
  });

  it('turns an Open-Meteo response into a forecast primitive', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              name: 'Porto',
              country: 'Portugal',
              admin1: 'Porto',
              latitude: 41.15,
              longitude: -8.61,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          timezone: 'Europe/Lisbon',
          daily: {
            time: ['2026-07-11', '2026-07-12', '2026-07-13'],
            weather_code: [1, 61, 95],
            temperature_2m_max: [24.4, 22.1, 21.8],
            temperature_2m_min: [16.2, 15.8, 15.1],
            precipitation_probability_max: [5, 65, 80],
          },
        }),
      );

    await expect(openMeteoPlugin.execute({ location: 'Porto', days: 3 })).resolves.toMatchObject({
      plugin: 'open-meteo',
      kind: 'weather-forecast',
      location: 'Porto, Portugal',
      days: [
        { condition: 'Partly cloudy', precipitationProbability: 5 },
        { condition: 'Rain', precipitationProbability: 65 },
        { condition: 'Thunderstorms', precipitationProbability: 80 },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const forecastRequest = fetchMock.mock.calls[1]?.[0];
    expect(forecastRequest ? requestUrl(forecastRequest) : '').toContain('forecast_days=3');
  });

  it('returns real GitHub search results in the requested ranking', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        total_count: 2,
        items: [
          repository(),
          repository({ full_name: 'openai/openai-node', stargazers_count: 900 }),
        ],
      }),
    );

    await expect(
      githubPlugin.execute({ query: 'AI SDK', ranking: 'stars', limit: 5 }),
    ).resolves.toMatchObject({
      plugin: 'github',
      kind: 'repository-list',
      query: 'AI SDK',
      ranking: 'stars',
      totalCount: 2,
      repositories: [
        { fullName: 'tanstack/ai', stars: 1200 },
        { fullName: 'openai/openai-node', stars: 900 },
      ],
    });

    const githubRequest = fetchMock.mock.calls[0]?.[0];
    const url = githubRequest ? new URL(requestUrl(githubRequest)) : undefined;
    expect(url?.pathname).toBe('/search/repositories');
    expect(url?.searchParams.get('sort')).toBe('stars');
  });

  it('sorts large repository matches by size without claiming a global sort', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        total_count: 2,
        items: [repository({ full_name: 'small/repo', size: 1000 }), repository({ size: 9000 })],
      }),
    );

    const result = await githubPlugin.execute({ query: '', ranking: 'size', limit: 5 });

    expect(result).toMatchObject({
      kind: 'repository-list',
      scope: expect.stringContaining('not global size sorting'),
      repositories: [{ fullName: 'tanstack/ai', sizeKb: 9000 }, { fullName: 'small/repo' }],
    });
  });

  it('describes the runtime contract and dispatches a validated call', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ total_count: 1, items: [repository()] }),
    );

    expect(pluginCatalog).toContain('window.y31.invoke');
    expect(pluginCatalog).toContain('weather-forecast');
    expect(pluginCatalog).toContain('repository-list');
    await expect(
      executePluginCall({
        plugin: 'github',
        input: { query: 'TanStack', ranking: 'stars', limit: 5 },
      }),
    ).resolves.toMatchObject({ kind: 'repository-list' });
  });

  it('surfaces public API failures with the service name', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 404));

    await expect(
      githubPlugin.execute({ query: 'missing', ranking: 'stars', limit: 5 }),
    ).rejects.toThrow('GitHub returned 404.');
  });
});
