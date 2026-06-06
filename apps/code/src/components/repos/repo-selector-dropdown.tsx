import { useSuspenseQuery } from '@tanstack/react-query';
import { Button } from '@workspace/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/ui/dropdown-menu';
import { ChevronDown, Pencil, Plus } from 'lucide-react';

import { repoQueries } from '#/queries';
import type { Doc, Id } from '#convex/_generated/dataModel';

interface RepoSelectorDropdownProps {
  onSelectRepo: (id: Id<'repos'>, selected: boolean) => Promise<boolean>;
  onManageRepos: () => void;
}

export function RepoSelectorDropdown({ onSelectRepo, onManageRepos }: RepoSelectorDropdownProps) {
  const { data: repos } = useSuspenseQuery(repoQueries.list);
  const label = getButtonLabel(repos);

  if (!repos.length)
    return (
      <Button type='button' onClick={onManageRepos}>
        <span>Add repository</span> <Plus />
      </Button>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type='button' variant='outline' className='w-fit'>
            <span className='truncate'>{label}</span>
            <ChevronDown />
          </Button>
        }
      />
      <DropdownMenuContent align='end' className='min-w-56'>
        <DropdownMenuGroup>
          {repos.map((repo) => (
            <DropdownMenuCheckboxItem
              key={repo._id}
              checked={repo.selected}
              onCheckedChange={(checked) => onSelectRepo(repo._id, checked)}
              onSelect={(e) => e.preventDefault()}
            >
              {getLabel(repo)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onManageRepos}>
          <Pencil />
          Edit synced repositories
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const getButtonLabel = (repos: Doc<'repos'>[]) => {
  const selectedRepos = repos.filter((r) => r.selected);
  if (selectedRepos.length > 1) return 'Multiple selected';

  const firstSelected = selectedRepos[0];
  if (!firstSelected) return 'Sync repository';

  return getLabel(firstSelected);
};

const getLabel = (repo: Doc<'repos'>) => `${repo.owner}/${repo.name}`;
