import { Link } from '@tanstack/react-router';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/ui/table';
import { Toggle } from '@workspace/ui/components/ui/toggle';
import { XIcon } from 'lucide-react';
import { useState } from 'react';

import { Page, SearchInput, StatusBadge, Urgency } from '#/features/maintenance/components';
import { filterCases, getContractor } from '#/features/maintenance/data';

export function MaintenanceInbox() {
  const [needsAttention, setNeedsAttention] = useState(true);
  const [search, setSearch] = useState('');
  const visibleCases = filterCases(needsAttention, search);

  return (
    <Page title='Maintenance'>
      <div className='flex flex-wrap gap-3'>
        <SearchInput label='Search cases' value={search} onChange={setSearch} />
        <Toggle
          variant='outline'
          pressed={needsAttention}
          onPressedChange={(pressed) => setNeedsAttention(pressed)}
        >
          Needs attention
          {needsAttention && <XIcon />}
        </Toggle>
      </div>
      <Table className='min-w-275'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-60'>Issue</TableHead>
            <TableHead>Property / unit</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Urgency</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Contractor</TableHead>
            <TableHead>Next action</TableHead>
            <TableHead className='text-right'>Age</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleCases.map((item) => (
            <TableRow key={item.id}>
              <TableCell className='py-4'>
                <Link
                  to='/maintenance/$caseId'
                  params={{ caseId: item.id }}
                  className='font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring'
                >
                  {item.title}
                </Link>
                <div className='mt-1 text-xs text-muted-foreground'>{item.id}</div>
              </TableCell>
              <TableCell>
                <div>{item.property}</div>
                <div className='mt-1 text-xs text-muted-foreground'>Unit {item.unit}</div>
              </TableCell>
              <TableCell className='text-muted-foreground'>{item.category}</TableCell>
              <TableCell>
                <Urgency value={item.urgency} />
              </TableCell>
              <TableCell>
                <StatusBadge status={item.status} />
              </TableCell>
              <TableCell>{getContractor(item.contractorId)?.company ?? 'Unassigned'}</TableCell>
              <TableCell className='text-muted-foreground'>{item.nextAction}</TableCell>
              <TableCell className='text-right text-muted-foreground tabular-nums'>
                {item.age}
              </TableCell>
            </TableRow>
          ))}
          {!visibleCases.length && (
            <TableRow>
              <TableCell colSpan={8} className='h-36 text-center text-muted-foreground'>
                No cases found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Page>
  );
}
