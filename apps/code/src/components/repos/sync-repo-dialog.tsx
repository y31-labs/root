import { api } from '#convex/_generated/api';
import { convexQuery } from '@convex-dev/react-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@workspace/ui/components/ui/command';
import { useAction, useMutation } from 'convex/react';
import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

type PublicRepoResult = {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  description: string | null;
  stars: number;
};

interface SyncRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SyncRepoDialog({ open, onOpenChange }: SyncRepoDialogProps) {
  const queryClient = useQueryClient();
  const searchPublicRepos = useAction(api.githubActions.searchPublicRepos);
  const createRepo = useMutation(api.repos.create);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<PublicRepoResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
      setResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;

    if (debouncedQuery.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);

    void searchPublicRepos({ query: debouncedQuery })
      .then((items) => {
        if (!cancelled) setResults(items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResults([]);
          setSearchError(err instanceof Error ? err.message : 'Search failed');
        }
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open, searchPublicRepos]);

  const handleSelect = async (repo: PublicRepoResult) => {
    setIsSyncing(true);
    try {
      await createRepo({
        owner: repo.owner,
        name: repo.name,
        defaultBranch: repo.defaultBranch,
      });
      await queryClient.invalidateQueries(convexQuery(api.repos.list));
      onOpenChange(false);
    } finally {
      setIsSyncing(false);
    }
  };

  const showIdleHint = query.trim().length < MIN_QUERY_LENGTH;
  const showEmpty =
    !showIdleHint && !isSearching && !searchError && debouncedQuery.length >= MIN_QUERY_LENGTH && results.length === 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add repository"
      description="Search for a public GitHub repository"
      showCloseButton
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search public repositories..."
          value={query}
          onValueChange={setQuery}
          disabled={isSyncing}
        />
        <CommandList>
          {showIdleHint && (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Type at least {MIN_QUERY_LENGTH} characters to search
            </p>
          )}
          {isSearching && (
            <p className="text-muted-foreground py-6 text-center text-sm">Searching...</p>
          )}
          {searchError && (
            <p className="text-destructive py-6 text-center text-sm">{searchError}</p>
          )}
          {showEmpty && <CommandEmpty>No repositories found.</CommandEmpty>}
          {!showIdleHint && !isSearching && !searchError && results.length > 0 && (
            <CommandGroup heading="Repositories">
              {results.map((repo) => (
                <CommandItem
                  key={repo.fullName}
                  value={repo.fullName}
                  disabled={isSyncing}
                  onSelect={() => void handleSelect(repo)}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{repo.fullName}</span>
                    {repo.description && (
                      <span className="text-muted-foreground truncate text-xs">{repo.description}</span>
                    )}
                  </div>
                  <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                    <Star className="size-3" />
                    {repo.stars.toLocaleString()}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
