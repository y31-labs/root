import type { api } from '#convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';

export type MarketBar = {
  t?: number;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
  vw?: number;
  n?: number;
};

export type MarketQuote = {
  updated?: number;
  last_updated?: number;
  session?: {
    close?: number;
    open?: number;
    high?: number;
    low?: number;
    volume?: number;
    change_percent?: number;
  };
};

export type SymbolCoreData = FunctionReturnType<
  typeof api.watchlist.fetchSymbolCoreData
>;

export type SymbolCorporateData = FunctionReturnType<
  typeof api.watchlist.fetchSymbolCorporateData
>;

export type SymbolIndicators = FunctionReturnType<
  typeof api.watchlist.fetchSymbolIndicators
>;

export type FetchQuotesResult = FunctionReturnType<
  typeof api.watchlist.fetchQuotes
>;

export type SymbolQuote = FetchQuotesResult['quotes'][number];

export type TickerDetailsResults = {
  ticker?: string;
  name?: string;
  description?: string;
  homepage_url?: string;
  list_date?: string;
  primary_exchange?: string;
  type?: string;
  market?: string;
  locale?: string;
  market_cap?: number;
  total_employees?: number;
  share_class_shares_outstanding?: number;
  weighted_shares_outstanding?: number;
  sic_description?: string;
  currency_name?: string;
  branding?: {
    icon_url?: string;
    logo_url?: string;
  };
  address?: {
    address1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
};

export type DividendResult = {
  id?: string;
  cash_amount?: number;
  currency?: string;
  declaration_date?: string;
  ex_dividend_date?: string;
  pay_date?: string;
  record_date?: string;
  frequency?: number;
  dividend_type?: string;
};

export type SplitResult = {
  id?: string;
  execution_date?: string;
  split_from?: number;
  split_to?: number;
};

export type RelatedCompanyResult = {
  ticker?: string;
};

export type NewsInsight = {
  ticker?: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | string;
  sentiment_reasoning?: string;
};

export type NewsPublisher = {
  name?: string;
  homepage_url?: string;
  logo_url?: string;
  favicon_url?: string;
};

export type NewsResult = {
  id?: string;
  title?: string;
  description?: string;
  article_url?: string;
  image_url?: string;
  author?: string;
  published_utc?: string;
  publisher?: NewsPublisher;
  insights?: NewsInsight[];
  tickers?: string[];
  keywords?: string[];
};

export type IndicatorValue = {
  timestamp?: number;
  value?: number;
};

export type MacdIndicatorValue = IndicatorValue & {
  signal?: number;
  histogram?: number;
};

export function toMarketBars(aggregates: unknown): MarketBar[] {
  const results =
    (aggregates as { results?: MarketBar[] } | undefined)?.results ?? [];
  return [...results].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
}

export type ChartRange = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

export const CHART_RANGES: ChartRange[] = [
  '1W',
  '1M',
  '3M',
  '6M',
  '1Y',
  'ALL',
];

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const RANGE_TO_DAYS: Record<Exclude<ChartRange, 'ALL'>, number> = {
  '1W': 7,
  '1M': 31,
  '3M': 92,
  '6M': 183,
  '1Y': 366,
};

export function filterBarsByRange(
  bars: MarketBar[],
  range: ChartRange,
): MarketBar[] {
  if (range === 'ALL' || bars.length === 0) return bars;
  const lastTs = bars.at(-1)?.t;
  if (typeof lastTs !== 'number') return bars;
  const cutoff = lastTs - RANGE_TO_DAYS[range] * DAY_IN_MS;
  return bars.filter((bar) => typeof bar.t === 'number' && bar.t >= cutoff);
}

export function getTickerDetails(
  details: unknown,
): TickerDetailsResults | undefined {
  return (details as { results?: TickerDetailsResults } | undefined)?.results;
}

export function getListResults<T>(value: unknown): T[] {
  return (value as { results?: T[] } | undefined)?.results ?? [];
}

export function getIndicatorValues<T extends IndicatorValue>(
  indicator: unknown,
): T[] {
  return (
    (indicator as { results?: { values?: T[] } } | undefined)?.results
      ?.values ?? []
  );
}

export function previousCloseToQuote(previousClose: unknown): MarketQuote | undefined {
  const bars = toMarketBars(previousClose);
  const bar = bars.at(-1);
  if (!bar) return undefined;
  const changePercent =
    typeof bar.c === 'number' && typeof bar.o === 'number' && bar.o > 0
      ? (bar.c - bar.o) / bar.o
      : undefined;
  return {
    updated: bar.t,
    last_updated: bar.t,
    session: {
      open: bar.o,
      close: bar.c,
      high: bar.h,
      low: bar.l,
      volume: bar.v,
      change_percent: changePercent,
    },
  };
}

