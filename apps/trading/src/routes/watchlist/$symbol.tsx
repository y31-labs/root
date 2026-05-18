import { LoadingView } from '#/components/app/loading-view';
import { Skeleton } from '@workspace/ui/components/ui/skeleton';
import { CorporateActionsCard } from '#/components/watchlist/corporate-actions-card';
import { IndicatorsCard } from '#/components/watchlist/indicators-card';
import {
  getTickerDetails,
  previousCloseToQuote,
  toMarketBars,
} from '#/components/watchlist/market-data';
import { NewsFeedCard } from '#/components/watchlist/news-feed-card';
import { PriceHero } from '#/components/watchlist/price-hero';
import { RelatedCompaniesCard } from '#/components/watchlist/related-companies-card';
import { TickerHeaderCard } from '#/components/watchlist/ticker-header-card';
import { useSetLocalStorage } from '#/hooks/use-localstorage';
import {
  getSymbolCorporateDataQueryOptions,
  getSymbolCoreDataQueryOptions,
  getSymbolIndicatorsQueryOptions,
  getSymbolQueryOptions,
} from '#/lib/watchlist/query-options';
import { api } from '#convex/_generated/api';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useConvex, useMutation } from 'convex/react';
import { Suspense, useCallback, useMemo } from 'react';

export const Route = createFileRoute('/watchlist/$symbol')({
  beforeLoad: async ({ context, params }) => {
    const symbol = await context.queryClient.ensureQueryData(getSymbolQueryOptions(params.symbol));

    return { title: symbol?.label ?? symbol?.symbol ?? 'Unknown Symbol' };
  },
  loader: ({ context, params }) => {
    const qc = context.queryClient;
    const c = context.convexClient;
    void qc.prefetchQuery(getSymbolCoreDataQueryOptions(c, params.symbol));
    void qc.prefetchQuery(getSymbolCorporateDataQueryOptions(c, params.symbol));
    void qc.prefetchQuery(getSymbolIndicatorsQueryOptions(c, params.symbol));
  },
  pendingComponent: () => <LoadingView />,
  component: WatchlistSymbolPage,
});

function WatchlistSymbolPage() {
  const { symbol: symbolParam } = Route.useParams();
  const { data: watchlistSymbol } = useSuspenseQuery(getSymbolQueryOptions(symbolParam));

  useSetLocalStorage('watchlist:last-selected-symbol', watchlistSymbol?.symbol ?? null);

  const removeSymbol = useMutation(api.watchlist.removeSymbol);
  const navigate = useNavigate();

  const handleRemove = useCallback(async () => {
    if (!watchlistSymbol) return;
    await removeSymbol({ symbol: watchlistSymbol.symbol });
    await navigate({ to: '/watchlist' });
  }, [watchlistSymbol, removeSymbol, navigate]);

  if (!watchlistSymbol) return <div>Symbol not found</div>;

  const symbol = watchlistSymbol.symbol;

  return (
    <div className="divide-y divide-border/50">
      <Suspense fallback={<CoreSectionSkeleton />}>
        <CoreSection symbol={symbol} label={watchlistSymbol.label} onRemove={handleRemove} />
      </Suspense>

      <Suspense fallback={<IndicatorsSectionSkeleton />}>
        <IndicatorsSection symbol={symbol} />
      </Suspense>

      <Suspense fallback={<CorporateSectionSkeleton />}>
        <CorporateSection symbol={symbol} />
      </Suspense>
    </div>
  );
}

// --- Sections ----------------------------------------------------------------

function CoreSection({
  symbol,
  label,
  onRemove,
}: {
  symbol: string;
  label: string | undefined;
  onRemove: () => Promise<void>;
}) {
  const convex = useConvex();
  const { data: core } = useSuspenseQuery(getSymbolCoreDataQueryOptions(convex, symbol));

  const bars = useMemo(() => toMarketBars(core.aggregates), [core.aggregates]);
  const quote = useMemo(() => previousCloseToQuote(core.previousClose), [core.previousClose]);
  const details = getTickerDetails(core.details);

  return (
    <>
      <div className="pb-10">
        <TickerHeaderCard symbol={symbol} label={label} details={details} onRemove={onRemove} />
      </div>

      <div className="py-10">
        <PriceHero bars={bars} quote={quote} />
      </div>
    </>
  );
}

function IndicatorsSection({ symbol }: { symbol: string }) {
  const convex = useConvex();
  const { data: indicators } = useSuspenseQuery(getSymbolIndicatorsQueryOptions(convex, symbol));

  return (
    <div className="py-10">
      <IndicatorsCard
        sma={indicators.sma}
        ema={indicators.ema}
        rsi={indicators.rsi}
        macd={indicators.macd}
      />
    </div>
  );
}

function CorporateSection({ symbol }: { symbol: string }) {
  const convex = useConvex();
  const { data: corporate } = useSuspenseQuery(getSymbolCorporateDataQueryOptions(convex, symbol));

  return (
    <>
      <div className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <CorporateActionsCard dividends={corporate.dividends} splits={corporate.splits} />
        <RelatedCompaniesCard relatedCompanies={corporate.relatedCompanies} />
      </div>

      <div className="pt-10">
        <NewsFeedCard symbol={symbol} news={corporate.news} />
      </div>
    </>
  );
}

// --- Skeletons ---------------------------------------------------------------

function CoreSectionSkeleton() {
  return (
    <>
      <div className="space-y-4 pb-10">
        <div className="flex items-start gap-4">
          <Skeleton className="size-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-24" />
          ))}
        </div>
        <Skeleton className="h-12 w-full max-w-3xl" />
      </div>

      <div className="grid gap-8 py-10 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-12 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-36" />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-56" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </>
  );
}

function IndicatorsSectionSkeleton() {
  return (
    <div className="py-10">
      <div className="space-y-4">
        <Skeleton className="h-3 w-32" />
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CorporateSectionSkeleton() {
  return (
    <>
      <div className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-16 rounded-full" />
            ))}
          </div>
        </div>
      </div>

      <div className="pt-10 space-y-3">
        <Skeleton className="h-3 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-full max-w-xl" />
            <Skeleton className="h-3 w-3/4 max-w-md" />
          </div>
        ))}
      </div>
    </>
  );
}
