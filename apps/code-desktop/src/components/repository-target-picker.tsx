import type { Repository, RepositoryTarget } from '@workspace/code-agent-contracts/sessions';
import { Button } from '@workspace/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/ui/dropdown-menu';
import { ChevronDown, FolderGit2, Plus, Settings2 } from 'lucide-react';

interface RepositoryTargetPickerProps {
  repositories: Repository[];
  targetsByRepository: Record<string, RepositoryTarget[]>;
  activeRepositoryId?: string;
  activeTargetId?: string;
  onSelect: (repositoryId: string, targetId?: string) => void;
  onOpenRepository: () => void;
  onManageTargets?: () => void;
}

export function RepositoryTargetPicker({
  repositories,
  targetsByRepository,
  activeRepositoryId,
  activeTargetId,
  onSelect,
  onOpenRepository,
  onManageTargets,
}: RepositoryTargetPickerProps) {
  const activeRepository = repositories.find((repository) => repository.id === activeRepositoryId);
  const activeTarget = activeRepositoryId
    ? targetsByRepository[activeRepositoryId]?.find((target) => target.id === activeTargetId)
    : undefined;
  const label = activeRepository
    ? activeTarget
      ? `${activeRepository.name} / ${activeTarget.name}`
      : activeRepository.name
    : 'Select target';

  if (!repositories.length) {
    return (
      <Button type='button' onClick={onOpenRepository}>
        <Plus data-icon='inline-start' />
        Open repository
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type='button' variant='outline' className='max-w-72 justify-between'>
            <span className='truncate'>{label}</span>
            <ChevronDown />
          </Button>
        }
      />
      <DropdownMenuContent align='end' className='min-w-72'>
        {repositories.map((repository) => {
          const targets = targetsByRepository[repository.id]?.filter((target) => target.selected);
          return (
            <DropdownMenuGroup key={repository.id}>
              <DropdownMenuLabel>{repository.name}</DropdownMenuLabel>
              {targets?.length ? (
                targets.map((target) => (
                  <DropdownMenuItem
                    key={target.id}
                    onClick={() => onSelect(repository.id, target.id)}
                  >
                    <span className='min-w-0'>
                      <span className='block truncate'>{target.name}</span>
                      <span className='block truncate text-muted-foreground text-xs'>
                        {target.path}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem onClick={() => onSelect(repository.id)}>
                  <FolderGit2 />
                  {repository.name}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          );
        })}
        <DropdownMenuSeparator />
        {onManageTargets ? (
          <DropdownMenuItem onClick={onManageTargets}>
            <Settings2 />
            Manage targets
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={onOpenRepository}>
          <Plus />
          Open repository
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
