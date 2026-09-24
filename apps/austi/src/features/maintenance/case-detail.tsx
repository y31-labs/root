import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/ui/native-select';

import { CaseTimeline } from '#/features/maintenance/case-timeline';
import { Field, Page, PreviewDialog } from '#/features/maintenance/components';
import { contractors, getContractor, type MaintenanceCase } from '#/features/maintenance/data';

interface CaseDetailProps {
  item: MaintenanceCase;
}

export function CaseDetail({ item }: CaseDetailProps) {
  const contractor = getContractor(item.contractorId);
  const contractorAction = (
    <PreviewDialog
      title={contractor ? 'Change contractor' : 'Assign contractor'}
      trigger={contractor ? 'Change contractor' : 'Assign contractor'}
      triggerVariant={item.status === 'Unassigned' ? 'default' : item.quote ? 'ghost' : 'outline'}
      confirmLabel='Assign'
    >
      <Field id='case-contractor' label='Contractor'>
        <NativeSelect id='case-contractor' defaultValue={contractor?.id ?? ''} className='w-full'>
          <NativeSelectOption value='' disabled>
            Select contractor
          </NativeSelectOption>
          {contractors
            .filter((entry) => entry.active)
            .map((entry) => (
              <NativeSelectOption key={entry.id} value={entry.id}>
                {entry.company} · {entry.trades.join(', ')}
              </NativeSelectOption>
            ))}
        </NativeSelect>
      </Field>
    </PreviewDialog>
  );
  return (
    <Page title={item.title}>
      <CaseTimeline item={item} contractorAction={contractorAction} />
    </Page>
  );
}
