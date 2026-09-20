import { createFileRoute } from '@tanstack/react-router';
import { Table, TableBody, TableCell, TableRow } from '@workspace/ui/components/ui/table';

import { ThemeSelect } from '#/components/settings/theme-select';

export const Route = createFileRoute('/settings')({
  beforeLoad: () => ({ title: 'Settings' }),
  component: SettingsRoute,
});

export function SettingsRoute() {
  return (
    <div className='mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto px-6 py-12'>
      <Table className='mt-6'>
        <TableBody>
          <Row label='Appearance'>
            <ThemeSelect />
          </Row>
          <Row label='Conversations'>-</Row>
        </TableBody>
      </Table>
    </div>
  );
}

interface RowProps {
  label: string;
  children: React.ReactNode;
}

function Row({ label, children }: RowProps) {
  return (
    <TableRow>
      <TableCell className='w-px'>{label}</TableCell>
      <TableCell className='whitespace-nowrap'>
        <div className='flex justify-end'>{children}</div>
      </TableCell>
    </TableRow>
  );
}
