import { Button } from '@workspace/ui/components/ui/button';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import { CheckCircle2 } from 'lucide-react';

interface ManifestEditorProps {
  baseCommitSha: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onApprove: () => void;
  onCancel: () => void;
}

export function ManifestEditor({
  baseCommitSha,
  value,
  disabled,
  onChange,
  onApprove,
  onCancel,
}: ManifestEditorProps) {
  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        Base commit <code>{baseCommitSha.slice(0, 12)}</code>. Review every command before approval.
      </p>
      <Textarea
        className='min-h-72 font-mono text-xs'
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className='flex gap-2'>
        <Button disabled={disabled} onClick={onApprove}>
          <CheckCircle2 data-icon='inline-start' />
          Approve manifest
        </Button>
        <Button variant='outline' onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
