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

import type { Doc, Id } from '#convex/_generated/dataModel';

type Repo = Doc<'repos'>;

interface RepoSelectorDropdownProps {
  repos: Repo[];
  onSelectRepo: (id: Id<'repos'>, selected: boolean) => Promise<boolean>;
  onManageRepos: () => void;
}

export function RepoSelectorDropdown({
  repos,
  onSelectRepo,
  onManageRepos,
}: RepoSelectorDropdownProps) {
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

const getButtonLabel = (repos: Repo[]) => {
  const selectedRepos = repos.filter((r) => r.selected);
  if (selectedRepos.length > 1) return 'Multiple selected';

  const firstSelected = selectedRepos[0];
  if (!firstSelected) return 'Sync repository';

  return getLabel(firstSelected);
};

const getLabel = (repo: Repo) => `${repo.owner}/${repo.name}`;
