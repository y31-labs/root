import {
  getListResults,
  type NewsInsight,
  type NewsResult,
} from '#/components/watchlist/market-data';
import { Section } from '#/components/watchlist/section';
import { cn } from '#/lib/utils';
import { IconExternalLink } from '@tabler/icons-react';

type NewsFeedCardProps = {
  symbol: string;
  news?: unknown;
};

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function NewsFeedCard({ symbol, news }: NewsFeedCardProps) {
  const items = getListResults<NewsResult>(news);

  return (
    <Section
      eyebrow='Latest news'
      description={`Recent headlines tagged with ${symbol}`}
    >
      {!items.length ? (
        <p className='text-sm text-muted-foreground'>
          No news available for this symbol.
        </p>
      ) : (
        <ul className='divide-y divide-border/60'>
          {items.slice(0, 10).map((item, idx) => (
            <li key={item.id ?? `${item.article_url}-${idx}`}>
              <NewsItem item={item} symbol={symbol} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function NewsItem({ item, symbol }: { item: NewsResult; symbol: string }) {
  const insight = item.insights?.find((i) => i.ticker === symbol);
  const published = item.published_utc
    ? dateTimeFormatter.format(new Date(item.published_utc))
    : undefined;

  const content = (
    <div className='flex gap-4 py-3.5'>
      {item.image_url ? (
        <img
          src={item.image_url}
          alt=''
          loading='lazy'
          className='hidden size-16 shrink-0 rounded-md object-cover sm:block'
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
          {item.publisher?.name ? (
            <span className='font-medium text-foreground'>
              {item.publisher.name}
            </span>
          ) : null}
          {published ? (
            <>
              <span className='text-muted-foreground/50'>·</span>
              <span>{published}</span>
            </>
          ) : null}
          <SentimentDot insight={insight} />
        </div>
        <h3 className='line-clamp-2 text-sm font-medium leading-snug'>
          {item.title ?? 'Untitled article'}
        </h3>
        {item.description ? (
          <p className='line-clamp-2 text-xs text-muted-foreground'>
            {item.description}
          </p>
        ) : null}
      </div>
      {item.article_url ? (
        <IconExternalLink className='mt-1 size-4 shrink-0 text-muted-foreground' />
      ) : null}
    </div>
  );

  if (!item.article_url) return content;

  return (
    <a
      href={item.article_url}
      target='_blank'
      rel='noreferrer'
      className='block transition-colors hover:bg-muted/40'
    >
      {content}
    </a>
  );
}

function SentimentDot({ insight }: { insight?: NewsInsight }) {
  if (!insight?.sentiment) return null;
  const sentiment = insight.sentiment;
  return (
    <span className='inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider'>
      <span
        className={cn(
          'size-1.5 rounded-full',
          sentiment === 'positive' && 'bg-success',
          sentiment === 'negative' && 'bg-danger',
          sentiment === 'neutral' && 'bg-muted-foreground/60',
        )}
      />
      <span
        className={cn(
          sentiment === 'positive' && 'text-success',
          sentiment === 'negative' && 'text-danger',
          sentiment === 'neutral' && 'text-muted-foreground',
        )}
      >
        {sentiment}
      </span>
    </span>
  );
}
