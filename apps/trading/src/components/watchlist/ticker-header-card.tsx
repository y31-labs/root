import { Popover, PopoverContent, PopoverTrigger } from '@workspace/ui/components/ui/popover';
import type { TickerDetailsResults } from '#/components/watchlist/market-data';
import { TickerActionsMenu } from '#/components/watchlist/ticker-actions-menu';
import { formatCompactNumber } from '#/components/watchlist/utils';
import { Fragment, useState } from 'react';

type TickerHeaderCardProps = {
  symbol: string;
  label?: string | null;
  details?: TickerDetailsResults;
  onRemove: () => Promise<void>;
};

type Fact = { label: string; value: string };

export function TickerHeaderCard({ symbol, label, details, onRemove }: TickerHeaderCardProps) {
  const name = details?.name ?? label ?? symbol;
  const description = details?.description;

  const metaChips: string[] = [];
  if (details?.primary_exchange) metaChips.push(details.primary_exchange);
  if (details?.currency_name) metaChips.push(details.currency_name.toUpperCase());
  if (details?.locale) metaChips.push(details.locale.toUpperCase());

  const facts: Fact[] = [];
  if (typeof details?.market_cap === 'number') {
    facts.push({
      label: 'Market cap',
      value: `$${formatCompactNumber(details.market_cap)}`,
    });
  }
  if (details?.sic_description) {
    facts.push({ label: 'Sector', value: details.sic_description });
  }
  if (details?.list_date) {
    facts.push({ label: 'Listed', value: details.list_date });
  }
  if (details?.type) {
    facts.push({ label: 'Type', value: details.type.toUpperCase() });
  }
  if (typeof details?.total_employees === 'number') {
    facts.push({
      label: 'Employees',
      value: formatCompactNumber(details.total_employees),
    });
  }
  if (typeof details?.weighted_shares_outstanding === 'number') {
    facts.push({
      label: 'Shares out.',
      value: formatCompactNumber(details.weighted_shares_outstanding),
    });
  }

  const hasPopover = !!description || facts.length > 0;

  const textBody = (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="truncate text-3xl font-semibold tracking-tight">{name}</h1>
        <span className="font-mono text-sm font-medium text-muted-foreground">{symbol}</span>
      </div>
      {metaChips.length ? (
        <p className="text-xs text-muted-foreground">
          {metaChips.map((chip, idx) => (
            <Fragment key={chip}>
              {idx > 0 ? <span className="mx-2 text-muted-foreground/50">·</span> : null}
              <span>{chip}</span>
            </Fragment>
          ))}
        </p>
      ) : null}
    </div>
  );

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <TickerLogo symbol={symbol} name={name} iconUrl={details?.branding?.icon_url} />
          {hasPopover ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="-m-2 min-w-0 rounded-lg p-2 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none"
                  aria-label={`About ${name}`}
                >
                  {textBody}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[380px] space-y-3 p-4">
                {description ? (
                  <p className="max-h-72 overflow-y-auto text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                ) : null}
                {description && facts.length ? <div className="border-t border-border/60" /> : null}
                {facts.length ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    {facts.map((fact) => (
                      <div key={fact.label} className="min-w-0 space-y-0.5">
                        <dt className="text-muted-foreground">{fact.label}</dt>
                        <dd className="truncate font-medium tabular-nums">{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </PopoverContent>
            </Popover>
          ) : (
            textBody
          )}
        </div>
        <TickerActionsMenu
          symbol={symbol}
          label={label ?? details?.name}
          homepageUrl={details?.homepage_url}
          onRemove={onRemove}
        />
      </div>
    </section>
  );
}

function TickerLogo({ symbol, name, iconUrl }: { symbol: string; name: string; iconUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const monogram = getMonogram(name || symbol);

  if (iconUrl && !failed) {
    return (
      <img
        src={iconUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="size-12 shrink-0 rounded-lg bg-muted object-contain p-1"
      />
    );
  }

  return (
    <div
      aria-hidden
      className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold uppercase text-muted-foreground"
    >
      {monogram}
    </div>
  );
}

function getMonogram(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? '') + (parts[1]![0] ?? '')).toUpperCase();
}
