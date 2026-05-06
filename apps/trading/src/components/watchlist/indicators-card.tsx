import { Section } from '#/components/watchlist/section';
import {
  getIndicatorValues,
  type IndicatorValue,
  type MacdIndicatorValue,
} from '#/components/watchlist/market-data';
import {
  TermHoverCard,
  type TermInfo,
} from '#/components/watchlist/term-hover-card';
import { cn } from '#/lib/utils';

type IndicatorsCardProps = {
  sma?: unknown;
  ema?: unknown;
  rsi?: unknown;
  macd?: unknown;
};

const valueFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INDICATOR_TERMS = {
  sma: {
    title: 'Simple Moving Average (SMA)',
    description:
      'Unweighted average of the last N closing prices. Smooths out short-term noise to reveal the underlying trend.',
    interpretation:
      'Price trading above the SMA is often read as an uptrend; below as a downtrend.',
  },
  ema: {
    title: 'Exponential Moving Average (EMA)',
    description:
      'Moving average that weights recent prices more heavily than older ones, so it reacts faster to new information than the SMA.',
    interpretation:
      'Crossovers between short and long EMAs are commonly used as trend-change signals.',
  },
  rsi: {
    title: 'Relative Strength Index (RSI)',
    description:
      'Momentum oscillator bounded from 0 to 100 that compares the magnitude of recent gains to recent losses over a given lookback period.',
    interpretation:
      'Readings >= 70 are typically called overbought, <= 30 oversold. 14 is the standard lookback window.',
  },
  macd: {
    title: 'Moving Average Convergence Divergence (MACD)',
    description:
      'The difference between a short-term EMA (typically 12) and a longer-term EMA (typically 26) of the closing price.',
    interpretation:
      'Crossing above zero or above the signal line is read as bullish momentum; crossing below is read as bearish.',
  },
  macdSignal: {
    title: 'MACD Signal Line',
    description:
      'A 9-period EMA of the MACD line itself, used as a smoothed reference against which MACD crossings are measured.',
    interpretation:
      'MACD crossing above the signal line is a common bullish trigger; crossing below is bearish.',
  },
  macdHistogram: {
    title: 'MACD Histogram',
    description:
      'The difference between the MACD line and its signal line, plotted as bars.',
    interpretation:
      'Positive bars indicate upward momentum, negative bars downward. Rising bars suggest strengthening momentum.',
  },
} as const satisfies Record<string, TermInfo>;

export function IndicatorsCard({
  sma,
  ema,
  rsi,
  macd,
}: IndicatorsCardProps) {
  const smaValue = getIndicatorValues<IndicatorValue>(sma)[0]?.value;
  const emaValue = getIndicatorValues<IndicatorValue>(ema)[0]?.value;
  const rsiValue = getIndicatorValues<IndicatorValue>(rsi)[0]?.value;
  const macdLatest = getIndicatorValues<MacdIndicatorValue>(macd)[0];

  const hasAny =
    typeof smaValue === 'number' ||
    typeof emaValue === 'number' ||
    typeof rsiValue === 'number' ||
    !!macdLatest;

  return (
    <Section eyebrow='Technical indicators' description='Most recent daily values'>
      {!hasAny ? (
        <p className='text-sm text-muted-foreground'>
          No indicator data available.
        </p>
      ) : (
        <div className='grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4'>
          <Stat
            label='SMA (20)'
            term='SMA'
            info={INDICATOR_TERMS.sma}
            value={formatValue(smaValue)}
            hint='20-day simple moving average'
          />
          <Stat
            label='EMA (20)'
            term='EMA'
            info={INDICATOR_TERMS.ema}
            value={formatValue(emaValue)}
            hint='20-day exponential moving average'
          />
          <Stat
            label='RSI (14)'
            term='RSI'
            info={INDICATOR_TERMS.rsi}
            value={formatValue(rsiValue)}
            hint='Relative strength index'
            accessory={<RsiStatus value={rsiValue} />}
          />
          <Stat
            label='MACD'
            term='MACD'
            info={INDICATOR_TERMS.macd}
            value={formatValue(macdLatest?.value)}
            hint={
              macdLatest ? (
                <span className='inline-flex flex-wrap items-center gap-x-1 gap-y-0.5'>
                  <TermHoverCard
                    term='Signal'
                    info={INDICATOR_TERMS.macdSignal}
                  >
                    <span>Signal</span>
                  </TermHoverCard>
                  <span className='tabular-nums'>
                    {formatValue(macdLatest.signal)}
                  </span>
                  <span className='text-muted-foreground/50'>·</span>
                  <TermHoverCard
                    term='Hist'
                    info={INDICATOR_TERMS.macdHistogram}
                  >
                    <span>Hist</span>
                  </TermHoverCard>
                  <span className='tabular-nums'>
                    {formatValue(macdLatest.histogram)}
                  </span>
                </span>
              ) : undefined
            }
            accessory={<MacdStatus value={macdLatest?.histogram} />}
          />
        </div>
      )}
    </Section>
  );
}

function Stat({
  label,
  term,
  info,
  value,
  hint,
  accessory,
}: {
  label: string;
  term?: string;
  info?: TermInfo;
  value: string;
  hint?: React.ReactNode;
  accessory?: React.ReactNode;
}) {
  const labelNode = (
    <span className='text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground'>
      {label}
    </span>
  );

  return (
    <div className='min-w-0 space-y-1'>
      <div className='flex items-center justify-between gap-2'>
        {info ? (
          <TermHoverCard term={term ?? label} info={info}>
            {labelNode}
          </TermHoverCard>
        ) : (
          labelNode
        )}
        {accessory}
      </div>
      <div className='text-2xl font-semibold tabular-nums'>{value}</div>
      {hint ? (
        <div className='truncate text-xs text-muted-foreground'>{hint}</div>
      ) : null}
    </div>
  );
}

function StatusDot({
  label,
  tone,
}: {
  label: string;
  tone: 'success' | 'danger' | 'neutral';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider',
        tone === 'success' && 'text-success',
        tone === 'danger' && 'text-danger',
        tone === 'neutral' && 'text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          tone === 'success' && 'bg-success',
          tone === 'danger' && 'bg-danger',
          tone === 'neutral' && 'bg-muted-foreground/60',
        )}
      />
      {label}
    </span>
  );
}

function RsiStatus({ value }: { value?: number }) {
  if (typeof value !== 'number') return null;
  if (value >= 70) return <StatusDot label='Overbought' tone='danger' />;
  if (value <= 30) return <StatusDot label='Oversold' tone='success' />;
  return <StatusDot label='Neutral' tone='neutral' />;
}

function MacdStatus({ value }: { value?: number }) {
  if (typeof value !== 'number') return null;
  return value >= 0 ? (
    <StatusDot label='Bullish' tone='success' />
  ) : (
    <StatusDot label='Bearish' tone='danger' />
  );
}

function formatValue(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return valueFormatter.format(value);
}
