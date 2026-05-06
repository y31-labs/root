import { Time } from '#convex/utils.ts';
import {
  DefaultApi,
  GetStocksAggregatesSortEnum,
  GetStocksAggregatesTimespanEnum,
  GetStocksEMASeriesTypeEnum,
  GetStocksEMATimespanEnum,
  GetStocksMACDSeriesTypeEnum,
  GetStocksMACDTimespanEnum,
  GetStocksRSISeriesTypeEnum,
  GetStocksRSITimespanEnum,
  GetStocksSMASeriesTypeEnum,
  GetStocksSMATimespanEnum,
} from '@massive.com/client-js';

// Massive "Stocks Basic" (free plan) limits:
// - 5 API calls / minute
// - 2 years historical data
// - End-of-day data only (no snapshots, no real-time quotes/trades)
// Docs: https://massive.com/pricing
const LOOKBACK_DAYS = 730;
const BAR_LIMIT = 800;

// Per-slice upstream request counts. Each stays <= 5 so a single slice fits
// inside one `getMassiveClient(ctx, N)` reservation against the `massiveApi`
// rate limiter (capacity 5 + maxReserved 5).
export const SYMBOL_CORE_REQUEST_COUNT = 3;
export const SYMBOL_CORPORATE_REQUEST_COUNT = 4;
export const SYMBOL_INDICATORS_REQUEST_COUNT = 4;
export const SYMBOL_QUOTE_REQUEST_COUNT = 1;

// --- Core: ticker details + recent aggregates + previous close ---------------

export const fetchSymbolCoreData = async (
  client: DefaultApi,
  symbol: string,
) => {
  const now = new Date();
  const from = new Date(now.getTime() - LOOKBACK_DAYS * Time.DAY)
    .toISOString()
    .slice(0, 10);
  const to = now.toISOString().slice(0, 10);

  try {
    const [details, aggregates, previousClose] = await Promise.allSettled([
      client.getTicker({ ticker: symbol }),
      client.getStocksAggregates({
        stocksTicker: symbol,
        multiplier: 1,
        timespan: GetStocksAggregatesTimespanEnum.Day,
        from,
        to,
        adjusted: true,
        sort: GetStocksAggregatesSortEnum.Desc,
        limit: BAR_LIMIT,
      }),
      client.getPreviousStocksAggregates({
        stocksTicker: symbol,
        adjusted: true,
      }),
    ]);

    return {
      details: rewriteBrandingUrls(settledOr(details, 'ticker.details', symbol)),
      aggregates: settledOr(aggregates, 'ticker.aggregates', symbol),
      previousClose: settledOr(previousClose, 'ticker.previousClose', symbol),
    };
  } catch (error) {
    logFetchError('fetchSymbolCoreData', symbol, error);
    throw error;
  }
};

// --- Corporate: dividends, splits, related companies, news -------------------

export const fetchSymbolCorporateData = async (
  client: DefaultApi,
  symbol: string,
) => {
  try {
    const [dividends, splits, relatedCompanies, news] =
      await Promise.allSettled([
        client.listDividends({ ticker: symbol, limit: 10 }),
        client.listStockSplits({ ticker: symbol, limit: 10 }),
        client.getRelatedCompanies({ ticker: symbol }),
        client.listNews({ ticker: symbol, limit: 10 }),
      ]);

    return {
      dividends: settledOr(dividends, 'corporate.dividends', symbol),
      splits: settledOr(splits, 'corporate.splits', symbol),
      relatedCompanies: settledOr(
        relatedCompanies,
        'corporate.relatedCompanies',
        symbol,
      ),
      news: settledOr(news, 'corporate.news', symbol),
    };
  } catch (error) {
    logFetchError('fetchSymbolCorporateData', symbol, error);
    throw error;
  }
};

// --- Indicators: SMA, EMA, RSI, MACD -----------------------------------------

export const fetchSymbolIndicators = async (
  client: DefaultApi,
  symbol: string,
) => {
  try {
    const [sma, ema, rsi, macd] = await Promise.allSettled([
      client.getStocksSMA({
        stockTicker: symbol,
        timespan: GetStocksSMATimespanEnum.Day,
        window: 20,
        seriesType: GetStocksSMASeriesTypeEnum.Close,
        limit: 10,
      }),
      client.getStocksEMA({
        stockTicker: symbol,
        timespan: GetStocksEMATimespanEnum.Day,
        window: 20,
        seriesType: GetStocksEMASeriesTypeEnum.Close,
        limit: 10,
      }),
      client.getStocksRSI({
        stockTicker: symbol,
        timespan: GetStocksRSITimespanEnum.Day,
        window: 14,
        seriesType: GetStocksRSISeriesTypeEnum.Close,
        limit: 10,
      }),
      client.getStocksMACD({
        stockTicker: symbol,
        timespan: GetStocksMACDTimespanEnum.Day,
        shortWindow: 12,
        longWindow: 26,
        signalWindow: 9,
        seriesType: GetStocksMACDSeriesTypeEnum.Close,
        limit: 10,
      }),
    ]);

    return {
      sma: settledOr(sma, 'indicators.sma', symbol),
      ema: settledOr(ema, 'indicators.ema', symbol),
      rsi: settledOr(rsi, 'indicators.rsi', symbol),
      macd: settledOr(macd, 'indicators.macd', symbol),
    };
  } catch (error) {
    logFetchError('fetchSymbolIndicators', symbol, error);
    throw error;
  }
};

// --- Quote (lightweight, 1 upstream call) ------------------------------------

export type SymbolQuote = {
  symbol: string;
  ok: boolean;
  price?: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  asOf?: number;
};

type AggregateBar = {
  t?: number;
  c?: number;
};

export const fetchSymbolQuote = async (
  client: DefaultApi,
  symbol: string,
): Promise<SymbolQuote> => {
  const now = new Date();
  const from = new Date(now.getTime() - 14 * Time.DAY)
    .toISOString()
    .slice(0, 10);
  const to = now.toISOString().slice(0, 10);

  try {
    const response = await client.getStocksAggregates({
      stocksTicker: symbol,
      multiplier: 1,
      timespan: GetStocksAggregatesTimespanEnum.Day,
      from,
      to,
      adjusted: true,
      sort: GetStocksAggregatesSortEnum.Desc,
      limit: 2,
    });

    const results =
      (response as { results?: AggregateBar[] } | undefined)?.results ?? [];
    const latest = results[0];
    const prior = results[1];

    const price = typeof latest?.c === 'number' ? latest.c : undefined;
    const previousClose = typeof prior?.c === 'number' ? prior.c : undefined;
    const change =
      typeof price === 'number' && typeof previousClose === 'number'
        ? price - previousClose
        : undefined;
    const changePercent =
      typeof change === 'number' &&
      typeof previousClose === 'number' &&
      previousClose > 0
        ? change / previousClose
        : undefined;

    return {
      symbol,
      ok: true,
      price,
      previousClose,
      change,
      changePercent,
      asOf: typeof latest?.t === 'number' ? latest.t : undefined,
    };
  } catch (error) {
    console.warn('fetchSymbolQuote failed', {
      symbol,
      status: (error as { response?: { status?: number } })?.response?.status,
      message: error instanceof Error ? error.message : String(error),
    });
    return { symbol, ok: false };
  }
};

// --- Shared helpers ----------------------------------------------------------

const logFetchError = (name: string, symbol: string, error: unknown) => {
  console.error(`${name} failed`, {
    symbol,
    status: (error as { response?: { status?: number } })?.response?.status,
    data: (error as { response?: { data?: unknown } })?.response?.data,
    message: error instanceof Error ? error.message : String(error),
  });
};

const MASSIVE_BRANDING_HOST = 'https://api.massive.com/';

const toProxiedBrandingUrl = (
  original: string | undefined,
): string | undefined => {
  if (!original || !original.startsWith(MASSIVE_BRANDING_HOST)) return original;
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) return original;
  return `${siteUrl}/branding/icon?src=${encodeURIComponent(original)}`;
};

type TickerDetailsShape = {
  results?: {
    branding?: { icon_url?: string; logo_url?: string };
  };
};

const rewriteBrandingUrls = <T>(details: T): T => {
  const typed = details as TickerDetailsShape | undefined;
  const branding = typed?.results?.branding;
  if (!branding) return details;

  return {
    ...typed,
    results: {
      ...typed?.results,
      branding: {
        ...branding,
        icon_url: toProxiedBrandingUrl(branding.icon_url),
        logo_url: toProxiedBrandingUrl(branding.logo_url),
      },
    },
  } as T;
};

// Unwraps a settled promise to its raw value, logging rejections instead of
// propagating them. Each slice is structurally independent (e.g. a ticker can
// legitimately have no dividends, or news can fail while aggregates succeed),
// so one failed call shouldn't block the rest of the slice.
const settledOr = <T>(
  result: PromiseSettledResult<T>,
  label: string,
  symbol: string,
): T | undefined => {
  if (result.status === 'fulfilled') return result.value;
  logFetchError(label, symbol, result.reason);
  return undefined;
};
