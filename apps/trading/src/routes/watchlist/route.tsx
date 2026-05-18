import type { SymbolQuote } from '#/components/watchlist/market-data';
import { WatchlistPanel } from '#/components/watchlist/watchlist-panel';
import { listQuotesQueryOptions, listSymbolsQueryOptions } from '#/lib/watchlist/query-options';
import { api } from '#convex/_generated/api';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { useConvex, useMutation } from 'convex/react';
import { useMemo } from 'react';
import { Route as WatchlistSymbolRoute } from '#/routes/watchlist/$symbol';

export const Route = createFileRoute('/watchlist')({
  beforeLoad: () => ({ title: 'Watchlist' }),
  loader: ({ context }) => context.queryClient.ensureQueryData(listSymbolsQueryOptions),
  component: WatchlistLayout,
});

function WatchlistLayout() {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const convex = useConvex();
  const { data: watchlist } = useSuspenseQuery(listSymbolsQueryOptions);
  const addSymbol = useMutation(api.watchlist.addSymbol);
  const symbolMatch = matchRoute({ to: WatchlistSymbolRoute.to });
  const selectedSymbol = symbolMatch ? symbolMatch.symbol : null;

  const symbols = useMemo(() => watchlist.map((w) => w.symbol).sort(), [watchlist]);

  const { data: quotesData, isPending: quotesLoading } = useQuery(
    listQuotesQueryOptions(convex, symbols),
  );

  const quotes = useMemo<Record<string, SymbolQuote>>(() => {
    const result: Record<string, SymbolQuote> = {};
    for (const quote of quotesData?.quotes ?? []) {
      if (quote.symbol) result[quote.symbol] = quote;
    }
    return result;
  }, [quotesData]);

  const onAddSymbol = async (symbol: string) => {
    await addSymbol({ symbol });
    await navigate({
      to: '/watchlist/$symbol',
      params: { symbol: symbol.trim().toUpperCase() },
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <div className="grid items-start gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <WatchlistPanel
          watchlist={watchlist}
          selectedSymbol={selectedSymbol}
          quotes={quotes}
          quotesLoading={quotesLoading && symbols.length > 0}
          onAddSymbol={onAddSymbol}
        />
        <div className="space-y-4">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
