import { api } from '#convex/_generated/api';
import { convexQuery } from '@convex-dev/react-query';
import { queryOptions } from '@tanstack/react-query';
import type { ConvexReactClient } from 'convex/react';

export const listSymbolsQueryOptions = convexQuery(
  api.watchlist.listSymbols,
  {},
);

export const getSymbolQueryOptions = (symbol: string) =>
  convexQuery(api.watchlist.getSymbol, { symbol });

// Convex actions aren't reactive like queries, so we wrap them in regular
// TanStack Query options. The Convex-side ActionCache handles TTL and
// deduplication; TanStack Query is just the client-side cache + Suspense
// integration. Each market-data slice has its own query so the symbol page
// can render them progressively.

const SLICE_STALE_TIME_MS = 60 * 60 * 1000;

export const getSymbolCoreDataQueryOptions = (
  convex: ConvexReactClient,
  symbol: string,
) =>
  queryOptions({
    queryKey: ['watchlist', 'marketData', 'core', symbol] as const,
    queryFn: () =>
      convex.action(api.watchlist.fetchSymbolCoreData, { symbol }),
    staleTime: SLICE_STALE_TIME_MS,
  });

export const getSymbolCorporateDataQueryOptions = (
  convex: ConvexReactClient,
  symbol: string,
) =>
  queryOptions({
    queryKey: ['watchlist', 'marketData', 'corporate', symbol] as const,
    queryFn: () =>
      convex.action(api.watchlist.fetchSymbolCorporateData, { symbol }),
    staleTime: SLICE_STALE_TIME_MS,
  });

export const getSymbolIndicatorsQueryOptions = (
  convex: ConvexReactClient,
  symbol: string,
) =>
  queryOptions({
    queryKey: ['watchlist', 'marketData', 'indicators', symbol] as const,
    queryFn: () =>
      convex.action(api.watchlist.fetchSymbolIndicators, { symbol }),
    staleTime: SLICE_STALE_TIME_MS,
  });

export const listQuotesQueryOptions = (
  convex: ConvexReactClient,
  symbols: string[],
) => {
  const sorted = [...symbols].sort();
  return queryOptions({
    queryKey: ['watchlist', 'quotes', sorted] as const,
    queryFn: async () => {
      if (sorted.length === 0) return { quotes: [] as const };
      return convex.action(api.watchlist.fetchQuotes, { symbols: sorted });
    },
    staleTime: 5 * 60 * 1000,
  });
};
