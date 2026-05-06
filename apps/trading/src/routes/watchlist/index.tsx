import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card';
import { useLocalStorage } from '#/hooks/use-localstorage';
import { listSymbolsQueryOptions } from '#/lib/watchlist/query-options';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/watchlist/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(listSymbolsQueryOptions),
  component: WatchlistIndexPage,
});

function WatchlistIndexPage() {
  const navigate = useNavigate({ from: '/watchlist/' });
  const { data: watchlist } = useSuspenseQuery(listSymbolsQueryOptions);
  const lastSelectedSymbol = useLocalStorage(
    'watchlist:last-selected-symbol',
    null,
  )[0];

  useEffect(() => {
    if (!lastSelectedSymbol) return;
    if (!watchlist.some((item) => item.symbol === lastSelectedSymbol)) return;

    navigate({
      to: '/watchlist/$symbol',
      params: { symbol: lastSelectedSymbol },
      replace: true,
    });
  }, [lastSelectedSymbol, navigate, watchlist]);

  return (
    <>
      <Card className='h-52'>
        <CardHeader>
          <CardTitle>Select a symbol</CardTitle>
          <CardDescription>
            Choose a symbol from your watchlist to view the chart.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>No symbol selected</CardTitle>
          <CardDescription>
            Last-day statistics will appear here after selecting a symbol.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </>
  );
}
