import { z } from 'zod';

import { weatherForecastPrimitiveSchema, weatherPluginCallSchema } from '#/lib/plugin-contract';
import { fetchPluginJson } from '#/server/plugins/http';
import { definePlugin } from '#/server/plugins/plugin';

const geocodingResponseSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        country: z.string().optional(),
        admin1: z.string().optional(),
        latitude: z.number(),
        longitude: z.number(),
      }),
    )
    .optional(),
});

const forecastResponseSchema = z.object({
  timezone: z.string(),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_probability_max: z.array(z.number().nullable()),
  }),
});

const weatherCondition = (code: number) => {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorms';
};

export const openMeteoPlugin = definePlugin({
  id: 'open-meteo',
  name: 'Open-Meteo',
  description:
    'Weather forecast for a named city or place over the next 3 to 7 days. Useful for near-term travel, events, and outdoor plans.',
  inputDescription:
    '{ location: "Porto", days: 5 } where location is a place string and days is an integer from 3 to 7',
  resultDescription:
    '{ plugin: "open-meteo", kind: "weather-forecast", location, timezone, days: [{ date, condition, temperatureMin, temperatureMax, precipitationProbability }] }',
  inputSchema: weatherPluginCallSchema.shape.input,
  execute: async ({ location, days }) => {
    const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
    geocodingUrl.searchParams.set('name', location);
    geocodingUrl.searchParams.set('count', '1');
    geocodingUrl.searchParams.set('language', 'en');
    const geocoding = geocodingResponseSchema.parse(
      await fetchPluginJson(geocodingUrl, 'Open-Meteo geocoding'),
    );
    const place = geocoding.results?.[0];

    if (!place) {
      throw new Error(`Open-Meteo could not find “${location}”.`);
    }

    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
    forecastUrl.searchParams.set('latitude', String(place.latitude));
    forecastUrl.searchParams.set('longitude', String(place.longitude));
    forecastUrl.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    );
    forecastUrl.searchParams.set('forecast_days', String(days));
    forecastUrl.searchParams.set('timezone', 'auto');
    const forecast = forecastResponseSchema.parse(
      await fetchPluginJson(forecastUrl, 'Open-Meteo forecast'),
    );

    const placeParts = [place.name, place.admin1, place.country].filter(
      (part, index, parts): part is string => Boolean(part) && parts.indexOf(part) === index,
    );

    return weatherForecastPrimitiveSchema.parse({
      plugin: 'open-meteo',
      kind: 'weather-forecast',
      location: placeParts.join(', '),
      timezone: forecast.timezone,
      days: forecast.daily.time.map((date, index) => {
        const code = forecast.daily.weather_code[index];
        const temperatureMin = forecast.daily.temperature_2m_min[index];
        const temperatureMax = forecast.daily.temperature_2m_max[index];
        const precipitationProbability = forecast.daily.precipitation_probability_max[index];

        if (
          code === undefined ||
          temperatureMin === undefined ||
          temperatureMax === undefined ||
          precipitationProbability === undefined
        ) {
          throw new Error('Open-Meteo returned an incomplete forecast.');
        }

        return {
          date,
          condition: weatherCondition(code),
          temperatureMin,
          temperatureMax,
          precipitationProbability: precipitationProbability ?? 0,
        };
      }),
    });
  },
});
