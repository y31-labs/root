import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '#/components/ui/chart';
import type { MarketBar } from '#/components/watchlist/market-data';
import { formatCurrency, formatShortDate } from '#/components/watchlist/utils';
import { Area, AreaChart, XAxis, YAxis } from 'recharts';
import { useId } from 'react';

const chartConfig = {
  close: {
    label: 'Close',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;

export type ChartDirection = 'up' | 'down' | 'flat';

const directionColor: Record<ChartDirection, string> = {
  up: 'var(--success)',
  down: 'var(--danger)',
  flat: 'var(--muted-foreground)',
};

export function StockChart({
  bars,
  direction = 'up',
  className,
}: {
  bars: MarketBar[];
  direction?: ChartDirection;
  className?: string;
}) {
  const gradientId = useId();
  const color = directionColor[direction];

  const chartData = bars
    .map((bar) => ({
      date: bar.t,
      close: bar.c,
    }))
    .filter(
      (bar): bar is { date: number; close: number } =>
        bar.date !== null && typeof bar.close === 'number',
    );

  if (!chartData.length) {
    return (
      <div className='flex h-full items-center justify-center text-sm text-muted-foreground'>
        No chart data available.
      </div>
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className={className ?? 'h-full w-full'}
    >
      <AreaChart
        data={chartData}
        margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0%' stopColor={color} stopOpacity={0.22} />
            <stop offset='100%' stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey='date'
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={48}
          tick={{ fontSize: 11 }}
          tickFormatter={(value) =>
            formatShortDate(typeof value === 'number' ? value : 0)
          }
        />
        <YAxis hide domain={['auto', 'auto']} />
        <ChartTooltip
          cursor={{
            stroke: 'var(--muted-foreground)',
            strokeOpacity: 0.4,
            strokeDasharray: '3 3',
          }}
          content={
            <ChartTooltipContent
              labelFormatter={(value) =>
                formatShortDate(typeof value === 'number' ? value : 0)
              }
              formatter={(value) => formatCurrency(Number(value))}
              indicator='line'
              hideLabel={false}
            />
          }
        />
        <Area
          dataKey='close'
          type='monotone'
          stroke={color}
          fill={`url(#${gradientId})`}
          strokeWidth={2}
          activeDot={{ r: 3, stroke: color, fill: color }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
