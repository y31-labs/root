import {
  getListResults,
  type RelatedCompanyResult,
} from '#/components/watchlist/market-data';
import { Section } from '#/components/watchlist/section';
import { Route as WatchlistSymbolRoute } from '#/routes/watchlist/$symbol';
import { Link } from '@tanstack/react-router';

type RelatedCompaniesCardProps = {
  relatedCompanies?: unknown;
};

export function RelatedCompaniesCard({
  relatedCompanies,
}: RelatedCompaniesCardProps) {
  const rows = getListResults<RelatedCompanyResult>(relatedCompanies).filter(
    (row): row is { ticker: string } => typeof row.ticker === 'string',
  );

  return (
    <Section
      eyebrow='Related companies'
      description='Peers based on market activity'
    >
      {!rows.length ? (
        <p className='text-sm text-muted-foreground'>
          No related companies available.
        </p>
      ) : (
        <div className='flex flex-wrap gap-2'>
          {rows.map(({ ticker }) => (
            <Link
              key={ticker}
              to={WatchlistSymbolRoute.to}
              params={{ symbol: ticker }}
              className='inline-flex items-center rounded-full bg-muted/60 px-3 py-1 font-mono text-xs font-medium text-foreground transition-colors hover:bg-muted'
            >
              {ticker}
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}
