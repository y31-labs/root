const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCurrency = (value: number) => currencyFormatter.format(value);

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
});

export const formatCompactNumber = (value: number) => compactNumberFormatter.format(value);

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  signDisplay: 'exceptZero',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatPercent = (value: number) => percentFormatter.format(value);

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
});

export const formatTime = (timestamp: number) => timeFormatter.format(new Date(timestamp));

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

export const formatShortDate = (timestamp: number) =>
  shortDateFormatter.format(new Date(timestamp));
