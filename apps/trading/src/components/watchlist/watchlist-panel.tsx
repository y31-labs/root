import { Button } from '@workspace/ui/components/ui/button';
import { Input } from '@workspace/ui/components/ui/input';
import { Skeleton } from '@workspace/ui/components/ui/skeleton';
import { Spinner } from '@workspace/ui/components/ui/spinner';
import type { SymbolQuote } from '#/components/watchlist/market-data';
import { formatCurrency } from '#/components/watchlist/utils';
import { cn } from '#/lib/utils';
import type { Doc } from '#convex/_generated/dataModel.js';
import { IconArrowDownRight, IconArrowUpRight, IconMinus } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useState, useTransition } from 'react';
import { Route as WatchlistSymbolRoute } from '#/routes/watchlist/$symbol';

type WatchlistPanelProps = {
  watchlist: Doc<'watchlists'>[];
  selectedSymbol: string | null;
  quotes?: Record<string, SymbolQuote>;
  quotesLoading?: boolean;
  onAddSymbol: (symbol: string) => Promise<void>;
};

export function WatchlistPanel({
  watchlist,
  selectedSymbol,
  quotes,
  quotesLoading,
  onAddSymbol,
}: WatchlistPanelProps) {
  const [newSymbol, setNewSymbol] = useState('');
  const [isAdding, startAddingTransition] = useTransition();

  const handleAddSymbol = () =>
    startAddingTransition(async () => {
      await onAddSymbol(newSymbol);
      startAddingTransition(() => setNewSymbol(''));
    });

  return (
    <div className="h-full min-h-[32rem] space-y-4">
      <div className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddSymbol();
          }}
          className="flex gap-2"
        >
          <Input
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            disabled={isAdding}
            placeholder="e.g. AAPL"
            maxLength={12}
          />
          <Button type="submit" disabled={!newSymbol.length || isAdding}>
            Add
            {isAdding ? <Spinner data-icon="inline-start" /> : null}
          </Button>
        </form>

        <div className="space-y-2">
          {!watchlist.length ? (
            <p className="text-sm text-muted-foreground">Your watchlist is empty.</p>
          ) : (
            watchlist.map(({ _id, symbol, label }) => {
              const isSelected = selectedSymbol === symbol;
              const quote = quotes?.[symbol];

              return (
                <Link
                  key={_id}
                  to={WatchlistSymbolRoute.to}
                  params={{ symbol }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border p-2',
                    isSelected && 'border-primary bg-primary/5',
                  )}
                >
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{label ?? symbol}</p>
                    {label ? (
                      <p className="truncate text-xs text-muted-foreground">{symbol}</p>
                    ) : null}
                  </div>
                  <QuoteCell quote={quote} loading={quotesLoading} />
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

type QuoteCellProps = {
  quote?: SymbolQuote;
  loading?: boolean;
};

function QuoteCell({ quote, loading }: QuoteCellProps) {
  if (!quote) {
    if (loading) {
      return (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-3 w-16" />
        </div>
      );
    }
    return null;
  }

  const price = quote.price;
  const change = quote.change;
  const changePercent = quote.changePercent;

  const direction: 'up' | 'down' | 'flat' =
    typeof change === 'number' ? (change > 0 ? 'up' : change < 0 ? 'down' : 'flat') : 'flat';

  const colorClass =
    direction === 'up'
      ? 'text-success'
      : direction === 'down'
        ? 'text-danger'
        : 'text-muted-foreground';

  const DirectionIcon =
    direction === 'up' ? IconArrowUpRight : direction === 'down' ? IconArrowDownRight : IconMinus;

  const priceLabel = typeof price === 'number' ? formatCurrency(price) : '—';

  const pctLabel =
    typeof changePercent === 'number' ? `${(Math.abs(changePercent) * 100).toFixed(2)}%` : null;

  return (
    <div className="flex shrink-0 flex-col items-end text-right tabular-nums">
      <p className="text-sm font-medium">{priceLabel}</p>
      {pctLabel ? (
        <p className={cn('flex items-center gap-0.5 text-[11px] font-medium', colorClass)}>
          <DirectionIcon className="size-3" />
          <span>{pctLabel}</span>
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">No change data</p>
      )}
    </div>
  );
}
