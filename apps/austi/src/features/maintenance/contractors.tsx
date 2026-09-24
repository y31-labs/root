import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import { Checkbox } from '@workspace/ui/components/ui/checkbox';
import { Input } from '@workspace/ui/components/ui/input';
import { Label } from '@workspace/ui/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/ui/native-select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/ui/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/ui/table';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';

import { Field, Page, PreviewDialog, SearchInput } from '#/features/maintenance/components';
import { contractors, trades, type Contractor } from '#/features/maintenance/data';

export function ContractorsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All contractors');
  const query = search.trim().toLowerCase();
  const visible = contractors.filter(
    (item) =>
      (status === 'All contractors' || (status === 'Active' ? item.active : !item.active)) &&
      [item.company, item.contact, item.area, item.properties, ...item.trades]
        .join(' ')
        .toLowerCase()
        .includes(query),
  );

  return (
    <Page title='Contractors'>
      <div className='flex flex-wrap items-center gap-3'>
        <SearchInput label='Search contractors' value={search} onChange={setSearch} />
        <NativeSelect
          aria-label='Contractor status'
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {['All contractors', 'Active', 'Disabled'].map((value) => (
            <NativeSelectOption key={value}>{value}</NativeSelectOption>
          ))}
        </NativeSelect>
        <div className='ml-auto'>
          <ContractorSheet />
        </div>
      </div>
      <Table className='min-w-[940px]'>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Trades</TableHead>
            <TableHead>Service area / properties</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Response timeout</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>
              <span className='sr-only'>Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((item) => (
            <TableRow key={item.id}>
              <TableCell className='py-4'>
                <div className='font-medium'>{item.company}</div>
                <div className='mt-1 text-xs text-muted-foreground'>{item.contact}</div>
              </TableCell>
              <TableCell>
                <div className='flex flex-wrap gap-1'>
                  {item.trades.map((trade) => (
                    <Badge key={trade} variant='secondary' className='font-normal'>
                      {trade}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <div>{item.area}</div>
                <div className='mt-1 text-xs text-muted-foreground'>{item.properties}</div>
              </TableCell>
              <TableCell className='tabular-nums'>#{item.priority}</TableCell>
              <TableCell>{item.timeoutHours} hours</TableCell>
              <TableCell>
                <Badge
                  variant={item.active ? 'secondary' : 'outline'}
                  className={item.active ? 'font-normal' : 'font-normal text-muted-foreground'}
                >
                  {item.active ? 'Active' : 'Disabled'}
                </Badge>
              </TableCell>
              <TableCell>
                <div className='flex justify-end gap-2'>
                  <ContractorSheet contractor={item} />
                  <PreviewDialog
                    title={`${item.active ? 'Disable' : 'Enable'} ${item.company}`}
                    trigger={item.active ? 'Disable' : 'Enable'}
                    confirmLabel={item.active ? 'Disable' : 'Enable'}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!visible.length && (
            <TableRow>
              <TableCell colSpan={7} className='h-36 text-center text-muted-foreground'>
                No contractors found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Page>
  );
}

export function ContractorSheet({ contractor }: { contractor?: Contractor }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={contractor ? `Edit ${contractor.company}` : undefined}
        render={
          <Button
            variant={contractor ? 'outline' : 'default'}
            size={contractor ? 'sm' : 'default'}
          />
        }
      >
        {contractor ? (
          'Edit'
        ) : (
          <>
            <Plus />
            Add contractor
          </>
        )}
      </SheetTrigger>
      <SheetContent
        aria-describedby={undefined}
        className='gap-0 data-[side=right]:w-full sm:max-w-lg!'
      >
        <SheetHeader className='border-b p-5'>
          <SheetTitle>{contractor ? 'Edit contractor' : 'Add contractor'}</SheetTitle>
        </SheetHeader>
        <div className='min-h-0 flex-1 overflow-y-auto p-5'>
          {open && <ContractorFields contractor={contractor} />}
        </div>
        <SheetFooter className='flex-row justify-end border-t p-5'>
          <SheetClose render={<Button variant='outline' />}>Cancel</SheetClose>
          <Button disabled>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ContractorFields({ contractor }: { contractor?: Contractor }) {
  const id = useId();
  return (
    <div className='space-y-5'>
      <Field id={`${id}-company`} label='Company'>
        <Input id={`${id}-company`} defaultValue={contractor?.company} />
      </Field>
      <Field id={`${id}-contact`} label='Contact person'>
        <Input id={`${id}-contact`} defaultValue={contractor?.contact} />
      </Field>
      <div className='grid gap-4 sm:grid-cols-2'>
        <Field id={`${id}-phone`} label='Phone'>
          <Input id={`${id}-phone`} type='tel' defaultValue={contractor?.phone} />
        </Field>
        <Field id={`${id}-email`} label='Email'>
          <Input id={`${id}-email`} type='email' defaultValue={contractor?.email} />
        </Field>
      </div>
      <fieldset className='space-y-3'>
        <legend className='mb-3 text-sm font-medium'>Trades</legend>
        <div className='grid grid-cols-2 gap-3'>
          {trades.map((trade, index) => (
            <div key={trade} className='flex items-center gap-2'>
              <Checkbox
                id={`${id}-trade-${index}`}
                defaultChecked={contractor?.trades.includes(trade) ?? false}
              />
              <Label htmlFor={`${id}-trade-${index}`} className='font-normal'>
                {trade}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>
      <Field id={`${id}-area`} label='Service area'>
        <Input id={`${id}-area`} defaultValue={contractor?.area} />
      </Field>
      <Field id={`${id}-properties`} label='Properties'>
        <Textarea id={`${id}-properties`} defaultValue={contractor?.properties} rows={2} />
      </Field>
      <div className='grid grid-cols-2 gap-4'>
        <Field id={`${id}-priority`} label='Priority'>
          <Input
            id={`${id}-priority`}
            type='number'
            min={1}
            step={1}
            defaultValue={contractor?.priority ?? 1}
          />
        </Field>
        <Field id={`${id}-timeout`} label='Response timeout'>
          <NativeSelect
            id={`${id}-timeout`}
            className='w-full'
            defaultValue={contractor?.timeoutHours ?? 2}
          >
            {[1, 2, 4, 8, 24].map((hours) => (
              <NativeSelectOption key={hours} value={hours}>
                {hours} {hours === 1 ? 'hour' : 'hours'}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
    </div>
  );
}
