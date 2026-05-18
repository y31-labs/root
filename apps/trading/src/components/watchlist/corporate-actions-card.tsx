import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/ui/table';
import {
  getListResults,
  type DividendResult,
  type SplitResult,
} from '#/components/watchlist/market-data';
import { Section } from '#/components/watchlist/section';
import { formatCurrency } from '#/components/watchlist/utils';

type CorporateActionsCardProps = {
  dividends?: unknown;
  splits?: unknown;
};

const FREQUENCY_LABEL: Record<number, string> = {
  0: 'One-time',
  1: 'Annual',
  2: 'Semi-annual',
  4: 'Quarterly',
  12: 'Monthly',
  24: 'Bi-monthly',
  52: 'Weekly',
};

export function CorporateActionsCard({ dividends, splits }: CorporateActionsCardProps) {
  const dividendRows = getListResults<DividendResult>(dividends);
  const splitRows = getListResults<SplitResult>(splits);

  const hasAny = dividendRows.length > 0 || splitRows.length > 0;

  return (
    <Section eyebrow="Corporate actions" description="Recent dividends and stock splits">
      {!hasAny ? (
        <p className="text-sm text-muted-foreground">No corporate actions on record.</p>
      ) : (
        <div className="space-y-6">
          {dividendRows.length ? (
            <div className="space-y-2">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Dividends
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ex-date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Pay date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dividendRows.slice(0, 6).map((row, idx) => (
                    <TableRow key={row.id ?? `${row.ex_dividend_date}-${idx}`}>
                      <TableCell className="font-medium">{row.ex_dividend_date ?? 'N/A'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {typeof row.cash_amount === 'number'
                          ? formatCurrency(row.cash_amount)
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {typeof row.frequency === 'number'
                          ? (FREQUENCY_LABEL[row.frequency] ?? `${row.frequency}x/yr`)
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.pay_date ?? 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {splitRows.length ? (
            <div className="space-y-2">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Splits
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Ratio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {splitRows.slice(0, 6).map((row, idx) => (
                    <TableRow key={row.id ?? `${row.execution_date}-${idx}`}>
                      <TableCell className="font-medium">{row.execution_date ?? 'N/A'}</TableCell>
                      <TableCell className="tabular-nums">
                        {typeof row.split_to === 'number' && typeof row.split_from === 'number'
                          ? `${row.split_to}-for-${row.split_from}`
                          : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      )}
    </Section>
  );
}
