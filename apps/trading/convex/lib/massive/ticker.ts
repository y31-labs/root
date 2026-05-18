import type { DefaultApi } from '@massive.com/client-js';

export const fetchTickerLabel = async (client: DefaultApi, symbol: string) =>
  await client.getTicker({ ticker: symbol }).then(({ results }) => results?.name ?? null);
