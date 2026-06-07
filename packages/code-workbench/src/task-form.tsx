import { Button } from '@workspace/ui/components/ui/button';
import { Input } from '@workspace/ui/components/ui/input';
import { Label } from '@workspace/ui/components/ui/label';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import { FileCode2 } from 'lucide-react';

interface TaskFormProps {
  title: string;
  body: string;
  disabled?: boolean;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSubmit: () => void;
}

export function TaskForm({
  title,
  body,
  disabled,
  onTitleChange,
  onBodyChange,
  onSubmit,
}: TaskFormProps) {
  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor='task-title'>Title</Label>
        <Input
          id='task-title'
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='task-body'>Acceptance criteria and context</Label>
        <Textarea
          id='task-body'
          className='min-h-40'
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
        />
      </div>
      <Button disabled={disabled || !title.trim() || !body.trim()} onClick={onSubmit}>
        <FileCode2 data-icon='inline-start' />
        Create task
      </Button>
    </div>
  );
}
