import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group';
import {
  CHART_RANGES,
  filterBarsByRange,
  type ChartRange,
  type MarketBar,
  type MarketQuote,
} from '#/components/watchlist/market-data';
import { StockChart, type ChartDirection } from '#/components/watchlist/stock-chart-card';
import {
  formatCompactNumber,
  formatCurrency,
  formatShortDate,
} from '#/components/watchlist/utils';
import { cn } from '#/lib/utils';
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconMinus,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';

type PriceHeroProps = {
  bars: MarketBar[];
  quote?: MarketQuote;
};

export function PriceHero({ bars, quote }: PriceHeroProps) {
  const [range, setRange] = useState<ChartRange>('1M');

  const rangedBars = useMemo(() => filterBarsByRange(bars, range), [
    bars,
    range,
  ]);

  const latestBar = bars.at(-1);
  const previousBar = bars.at(-2);
  const close = latestBar?.c;
  const volume = latestBar?.v;

  const sessionReference =
    previousBar?.c ?? quote?.session?.open ?? quote?.session?.close;
  const dayChange =
    typeof close === 'number' && typeof sessionReference === 'number'
      ? close - sessionReference
      : undefined;
  const dayChangePercent =
    typeof dayChange === 'number' &&
    typeof sessionReference === 'number' &&
    sessionReference > 0
      ? dayChange / sessionReference
      : quote?.session?.change_percent;

  const rangeDirection: ChartDirection = useMemo(() => {
    if (rangedBars.length < 2) return 'flat';
    const first = rangedBars[0]?.c;
    const last = rangedBars.at(-1)?.c;
    if (typeof first !== 'number' || typeof last !== 'number') return 'flat';
    if (last > first) return 'up';
    if (last < first) return 'down';
    return 'flat';
  }, [rangedBars]);

  const deltaDirection: ChartDirection =
    typeof dayChange === 'number'
      ? dayChange > 0
        ? 'up'
        : dayChange < 0
          ? 'down'
          : 'flat'
      : 'flat';

  const deltaColor =
    deltaDirection === 'up'
      ? 'text-success'
      : deltaDirection === 'down'
        ? 'text-danger'
        : 'text-muted-foreground';

  const DeltaIcon =
    deltaDirection === 'up'
      ? IconArrowUpRight
      : deltaDirection === 'down'
        ? IconArrowDownRight
        : IconMinus;

  const priceLabel = typeof close === 'number' ? formatCurrency(close) : 'N/A';
  const absDelta =
    typeof dayChange === 'number'
      ? `${dayChange > 0 ? '+' : dayChange < 0 ? '−' : ''}${formatCurrency(
          Math.abs(dayChange),
        )}`
      : null;
  const pctDelta =
    typeof dayChangePercent === 'number'
      ? `${dayChangePercent > 0 ? '+' : dayChangePercent < 0 ? '−' : ''}${(
          Math.abs(dayChangePercent) * 100
        ).toFixed(2)}%`
      : null;

  const asOf = latestBar?.t ? formatShortDate(latestBar.t) : null;
  const volumeText =
    typeof volume === 'number' ? `${formatCompactNumber(volume)} vol` : null;

  return (
    <section className='grid gap-8 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-start'>
      <div className='space-y-2'>
        <p className='text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground'>
          Last price
        </p>
        <div className='text-5xl font-semibold tracking-tight tabular-nums'>
          {priceLabel}
        </div>
        {absDelta || pctDelta ? (
          <div
            className={cn(
              'flex items-center gap-1.5 text-sm font-medium tabular-nums',
              deltaColor,
            )}
          >
            <DeltaIcon className='size-4' />
            {absDelta ? <span>{absDelta}</span> : null}
            {pctDelta ? (
              <span className='text-muted-foreground/70'>·</span>
            ) : null}
            {pctDelta ? <span>{pctDelta}</span> : null}
          </div>
        ) : null}
        {(asOf || volumeText) && (
          <p className='text-xs text-muted-foreground'>
            {asOf ? `As of ${asOf}` : null}
            {asOf && volumeText ? (
              <span className='mx-1.5 text-muted-foreground/50'>·</span>
            ) : null}
            {volumeText}
          </p>
        )}
      </div>

      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <p className='text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground'>
            Price history
          </p>
          <ToggleGroup
            type='single'
            size='sm'
            value={range}
            onValueChange={(value) => {
              if (value) setRange(value as ChartRange);
            }}
            className='gap-0.5 rounded-md'
          >
            {CHART_RANGES.map((r) => (
              <ToggleGroupItem
                key={r}
                value={r}
                aria-label={`Show ${r} range`}
                className='h-7 min-w-10 rounded-md px-2 text-xs font-medium'
              >
                {r}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className='h-64 w-full'>
          <StockChart bars={rangedBars} direction={rangeDirection} />
        </div>
      </div>
    </section>
  );
}
