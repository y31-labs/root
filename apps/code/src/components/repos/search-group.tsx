import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CommandGroup, CommandItem, CommandSeparator } from '@workspace/ui/components/ui/command';
import { Skeleton } from '@workspace/ui/components/ui/skeleton';
import { FolderGit2 } from 'lucide-react';

import { githubInstallationsQueries, useSearchRepos } from '#/queries';
import type { RepoSearchResult } from '#convex/githubActions';

interface SearchGroupProps {
  query: string;
  enabled: boolean;
  disabled: boolean;
  onSelect: (repo: RepoSearchResult) => void;
}

const SKELETON_COUNT = 3;
const MIN_QUERY_LENGTH = 2;

export function SearchGroup({ query, enabled, disabled, onSelect }: SearchGroupProps) {
  const { data: installationsCount } = useSuspenseQuery(githubInstallationsQueries.count);
  const { data: repos, status, error } = useSearchRepos(query, enabled, MIN_QUERY_LENGTH);

  const hasInstallations = !!installationsCount;
  const hasQuery = query.trim().length >= MIN_QUERY_LENGTH;
  const hasRepos = !!repos?.length;

  const noResults = status === 'success' && hasQuery && !hasRepos;

  const showBanner = !hasInstallations && !error && (status === 'idle' || noResults);
  const showSkeleton = status === 'pending';
  const showEmptyMessage = hasInstallations && noResults && !error;

  const showResults = !showBanner && (showSkeleton || showEmptyMessage || !!error || hasRepos);

  if (!showBanner && !showResults) return;

  return (
    <>
      <CommandSeparator />
      {showBanner && <CommandGroupSuggestions />}
      {showResults && (
        <CommandGroup heading='Results'>
          {showSkeleton &&
            Array.from({ length: SKELETON_COUNT }, (_, index) => <CommandSkeleton key={index} />)}
          {showEmptyMessage && (
            <CommandItem disabled>
              <span className='text-muted-foreground'>No results found</span>
            </CommandItem>
          )}
          {error && (
            <CommandItem disabled>
              <span className='text-destructive'>
                {error instanceof Error ? error.message : 'Search failed'}
              </span>
            </CommandItem>
          )}
          {repos?.map((repo) => (
            <CommandItem
              key={repo.publicId}
              value={repo.fullName}
              disabled={disabled}
              onSelect={() => onSelect(repo)}
            >
              {repo.owner}/{repo.name}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  );
}

function CommandGroupSuggestions() {
  const navigate = useNavigate();

  return (
    <CommandGroup heading='Suggestions'>
      <CommandItem onSelect={() => navigate({ to: '/api/github/install', reloadDocument: true })}>
        <FolderGit2 /> Connect GitHub
      </CommandItem>
    </CommandGroup>
  );
}

function CommandSkeleton() {
  return (
    <div className='flex items-center justify-between gap-2 rounded-sm px-2 py-1.5'>
      <Skeleton className='h-4 w-full' />
    </div>
  );
}
