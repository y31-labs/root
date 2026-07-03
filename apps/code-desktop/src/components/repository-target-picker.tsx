import type { Repository, RepositoryTarget } from '@workspace/code-agent-contracts/sessions';
import { Button } from '@workspace/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@workspace/ui/components/ui/dropdown-menu';
import { ChevronDown, FolderGit2, GitBranch, Plus, Settings2 } from 'lucide-react';

interface RepositoryTargetPickerProps {
  repositories: Repository[];
  targetsByRepository: Record<string, RepositoryTarget[]>;
  activeRepositoryId?: string;
  activeTargetId?: string;
  onSelect: (repositoryId: string, targetId?: string) => void;
  onOpenRepository: () => void;
  onManageRepositories?: () => void;
}

const targetGroups = [
  { kind: 'app', label: 'Apps' },
  { kind: 'package', label: 'Packages' },
  { kind: 'other', label: 'Other' },
] as const;

export function RepositoryTargetPicker({
  repositories,
  targetsByRepository,
  activeRepositoryId,
  activeTargetId,
  onSelect,
  onOpenRepository,
  onManageRepositories,
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
        {activeRepository ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <span className='block truncate'>{activeRepository.name}</span>
              <span className='text-muted-foreground block truncate text-xs'>
                {activeRepository.path}
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <GitBranch />
              Switch target
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className='min-w-72'>
              {repositories.map((repository) => {
                const targets = targetsByRepository[repository.id]?.filter(
                  (target) => target.selected,
                );
                return (
                  <DropdownMenuGroup key={repository.id}>
                    <DropdownMenuLabel>{repository.name}</DropdownMenuLabel>
                    {targets?.length ? (
                      targetGroups.flatMap((group) => {
                        const groupTargets = targets.filter((target) => target.kind === group.kind);
                        if (!groupTargets.length) return [];
                        return [
                          <DropdownMenuLabel key={`${repository.id}-${group.kind}`} className='pt-2'>
                            {group.label}
                          </DropdownMenuLabel>,
                          ...groupTargets.map((target) => (
                            <DropdownMenuItem
                              key={target.id}
                              onClick={() => onSelect(repository.id, target.id)}
                            >
                              <span className='min-w-0'>
                                <span className='block truncate'>{target.name}</span>
                                <span className='text-muted-foreground block truncate text-xs'>
                                  {target.path}
                                </span>
                              </span>
                            </DropdownMenuItem>
                          )),
                        ];
                      })
                    ) : (
                      <DropdownMenuItem onClick={() => onSelect(repository.id)}>
                        <FolderGit2 />
                        {repository.name}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuGroup>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderGit2 />
              Switch repository
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className='min-w-64'>
              {repositories.map((repository) => (
                <DropdownMenuItem key={repository.id} onClick={() => onSelect(repository.id)}>
                  <span className='min-w-0'>
                    <span className='block truncate'>{repository.name}</span>
                    <span className='text-muted-foreground block truncate text-xs'>
                      {repository.path}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onOpenRepository}>
          <Plus />
          Open repository
        </DropdownMenuItem>
        {onManageRepositories ? (
          <DropdownMenuItem onClick={onManageRepositories}>
            <Settings2 />
            Configure project map
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
