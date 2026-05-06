import { components, internal } from '#convex/_generated/api.js';
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from '#convex/_generated/server';
import {
  fetchSymbolCoreData as fetchSymbolCoreDataLib,
  fetchSymbolCorporateData as fetchSymbolCorporateDataLib,
  fetchSymbolIndicators as fetchSymbolIndicatorsLib,
  fetchSymbolQuote as fetchSymbolQuoteLib,
  fetchTickerLabel,
  getMassiveClient,
  SYMBOL_CORE_REQUEST_COUNT,
  SYMBOL_CORPORATE_REQUEST_COUNT,
  SYMBOL_INDICATORS_REQUEST_COUNT,
  SYMBOL_QUOTE_REQUEST_COUNT,
  type SymbolQuote,
} from '#convex/lib/massive';
import { verifyIdentity } from '#convex/utils';
import { ActionCache } from '@convex-dev/action-cache';
import { v } from 'convex/values';

// --- Watchlist CRUD ----------------------------------------------------------

export const listSymbols = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyIdentity(ctx);

    return await ctx.db
      .query('watchlists')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .collect();
  },
});

export const getSymbol = query({
  args: {
    symbol: v.string(),
  },
  handler: async (ctx, { symbol }) => {
    const identity = await verifyIdentity(ctx);

    symbol = normalizeSymbol(symbol);
    if (!symbol) throw new Error('Symbol is required');

    return await ctx.db
      .query('watchlists')
      .withIndex('by_user_symbol', (q) =>
        q.eq('userId', identity.subject).eq('symbol', symbol),
      )
      .unique();
  },
});

export const getSymbolInternal = internalQuery({
  args: {
    id: v.id('watchlists'),
  },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const addSymbol = mutation({
  args: {
    symbol: v.string(),
  },
  handler: async (ctx, { symbol }) => {
    const identity = await verifyIdentity(ctx);

    symbol = normalizeSymbol(symbol);
    if (!symbol) throw new Error('Symbol is required');

    const existing = await ctx.db
      .query('watchlists')
      .withIndex('by_user_symbol', (q) =>
        q.eq('userId', identity.subject).eq('symbol', symbol),
      )
      .unique();
    if (existing) return existing._id;

    const id = await ctx.db.insert('watchlists', {
      userId: identity.subject,
      symbol,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.watchlist.hydrateSymbolLabelInternal,
      {
        id,
      },
    );

    return id;
  },
});

export const hydrateSymbolLabelInternal = internalAction({
  args: {
    id: v.id('watchlists'),
  },
  handler: async (ctx, { id }) => {
    const watchlistSymbol = await ctx.runQuery(
      internal.watchlist.getSymbolInternal,
      {
        id,
      },
    );
    if (!watchlistSymbol) throw new Error('Watchlist symbol not found');

    const client = await getMassiveClient(ctx, 1);
    const label = await fetchTickerLabel(client, watchlistSymbol.symbol);
    if (!label) {
      console.warn('Failed to fetch ticker label', { id });
      return;
    }

    await ctx.runMutation(internal.watchlist.updateSymbolLabelInternal, {
      id,
      label,
    });
  },
});

export const updateSymbolLabelInternal = internalMutation({
  args: {
    id: v.id('watchlists'),
    label: v.string(),
  },
  handler: async (ctx, { id, label }) => await ctx.db.patch(id, { label }),
});

export const removeSymbol = mutation({
  args: {
    symbol: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyIdentity(ctx);

    const symbol = normalizeSymbol(args.symbol);
    if (!symbol) return { removed: false };

    const existing = await ctx.db
      .query('watchlists')
      .withIndex('by_user_symbol', (q) =>
        q.eq('userId', identity.subject).eq('symbol', symbol),
      )
      .unique();
    if (!existing) return { removed: false };

    await ctx.db.delete(existing._id);
    return { removed: true };
  },
});

// --- Market data: three independently cached slices --------------------------
//
// Each slice's cached internal action reserves its own Massive tokens (<= 5)
// via `getMassiveClient`. A single symbol's full market data needs 3 + 4 + 4
// = 11 upstream calls, spread across three rate-limiter reservations so none
// of them individually exceeds `capacity + maxReserved`. Each slice is
// exposed as its own public action so the frontend can stream them
// progressively into the page.

type SymbolCoreData = Awaited<ReturnType<typeof fetchSymbolCoreDataLib>>;
type SymbolCorporateData = Awaited<
  ReturnType<typeof fetchSymbolCorporateDataLib>
>;
type SymbolIndicators = Awaited<ReturnType<typeof fetchSymbolIndicatorsLib>>;

export const fetchSymbolCoreDataInternal = internalAction({
  args: { symbol: v.string() },
  handler: async (ctx, { symbol }): Promise<SymbolCoreData> => {
    const client = await getMassiveClient(ctx, SYMBOL_CORE_REQUEST_COUNT);
    return fetchSymbolCoreDataLib(client, symbol);
  },
});

export const fetchSymbolCorporateDataInternal = internalAction({
  args: { symbol: v.string() },
  handler: async (ctx, { symbol }): Promise<SymbolCorporateData> => {
    const client = await getMassiveClient(ctx, SYMBOL_CORPORATE_REQUEST_COUNT);
    return fetchSymbolCorporateDataLib(client, symbol);
  },
});

export const fetchSymbolIndicatorsInternal = internalAction({
  args: { symbol: v.string() },
  handler: async (ctx, { symbol }): Promise<SymbolIndicators> => {
    const client = await getMassiveClient(ctx, SYMBOL_INDICATORS_REQUEST_COUNT);
    return fetchSymbolIndicatorsLib(client, symbol);
  },
});

const MARKET_DATA_TTL_MS = 24 * 60 * 60 * 1000;

const coreDataCache = new ActionCache(components.actionCache, {
  action: internal.watchlist.fetchSymbolCoreDataInternal,
  name: 'symbolCoreDataV2',
  ttl: MARKET_DATA_TTL_MS,
});

const corporateDataCache = new ActionCache(components.actionCache, {
  action: internal.watchlist.fetchSymbolCorporateDataInternal,
  name: 'symbolCorporateDataV2',
  ttl: MARKET_DATA_TTL_MS,
});

const indicatorsCache = new ActionCache(components.actionCache, {
  action: internal.watchlist.fetchSymbolIndicatorsInternal,
  name: 'symbolIndicatorsV2',
  ttl: MARKET_DATA_TTL_MS,
});

export const fetchSymbolCoreData = action({
  args: { symbol: v.string() },
  handler: async (ctx, { symbol }): Promise<SymbolCoreData> => {
    await verifyIdentity(ctx);
    const normalized = normalizeSymbol(symbol);
    if (!normalized) throw new Error('Symbol is required');
    return coreDataCache.fetch(ctx, { symbol: normalized });
  },
});

export const fetchSymbolCorporateData = action({
  args: { symbol: v.string() },
  handler: async (ctx, { symbol }): Promise<SymbolCorporateData> => {
    await verifyIdentity(ctx);
    const normalized = normalizeSymbol(symbol);
    if (!normalized) throw new Error('Symbol is required');
    return corporateDataCache.fetch(ctx, { symbol: normalized });
  },
});

export const fetchSymbolIndicators = action({
  args: { symbol: v.string() },
  handler: async (ctx, { symbol }): Promise<SymbolIndicators> => {
    await verifyIdentity(ctx);
    const normalized = normalizeSymbol(symbol);
    if (!normalized) throw new Error('Symbol is required');
    return indicatorsCache.fetch(ctx, { symbol: normalized });
  },
});

// --- Quotes (single-call slice) ----------------------------------------------

export const fetchSymbolQuoteInternal = internalAction({
  args: {
    symbol: v.string(),
  },
  handler: async (ctx, { symbol }): Promise<SymbolQuote> => {
    const client = await getMassiveClient(ctx, SYMBOL_QUOTE_REQUEST_COUNT);
    return fetchSymbolQuoteLib(client, symbol);
  },
});

const quoteCache = new ActionCache(components.actionCache, {
  action: internal.watchlist.fetchSymbolQuoteInternal,
  name: 'symbolQuoteV1',
  ttl: 60 * 60 * 1000,
});

export const fetchQuotes = action({
  args: {
    symbols: v.array(v.string()),
  },
  handler: async (
    ctx,
    { symbols },
  ): Promise<{ quotes: SymbolQuote[] }> => {
    await verifyIdentity(ctx);

    const normalized = Array.from(
      new Set(symbols.map(normalizeSymbol).filter(Boolean)),
    );

    const quotes = await Promise.all(
      normalized.map((symbol) => quoteCache.fetch(ctx, { symbol })),
    );

    return { quotes };
  },
});

const normalizeSymbol = (value: string) => value.trim().toUpperCase();
