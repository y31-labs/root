import { Button } from '@workspace/ui/components/ui/button';
import { Folder } from 'lucide-react';

interface FolderPickerProps {
  workingDirectory?: string;
  onSelect: () => void;
}

export function FolderPicker({ workingDirectory, onSelect }: FolderPickerProps) {
  return (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      className='mb-2 ml-2 max-w-[calc(100%-0.5rem)] rounded-full px-2 font-normal text-muted-foreground'
      aria-label={
        workingDirectory ? `Change working folder: ${workingDirectory}` : 'Select working folder'
      }
      title={workingDirectory}
      onClick={onSelect}
    >
      <Folder />
      <span className='truncate'>
        {workingDirectory ? folderName(workingDirectory) : 'Select folder'}
      </span>
    </Button>
  );
}

const folderName = (path: string) => {
  const name = path.split(/[\\/]/).filter(Boolean).at(-1);
  return name ?? path;
};
