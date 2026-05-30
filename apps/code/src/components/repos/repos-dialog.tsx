import { convexQuery } from "@convex-dev/react-query";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/ui/alert-dialog";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/ui/components/ui/command";
import { Spinner } from "@workspace/ui/components/ui/spinner";
import { useAction, useMutation } from "convex/react";
import { Star, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { api } from "#convex/_generated/api";
import type { Id } from "#convex/_generated/dataModel";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

type Repo = {
  _id: Id<"repos">;
  owner: string;
  name: string;
};

type PublicRepoResult = {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  description: string | null;
  stars: number;
};

interface ReposDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repos: Repo[];
}

export function ReposDialog({ open, onOpenChange, repos }: ReposDialogProps) {
  const queryClient = useQueryClient();
  const searchPublicRepos = useAction(api.githubActions.searchPublicRepos);
  const createRepo = useMutation(api.repos.create);
  const removeRepo = useMutation(api.repos.remove);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<PublicRepoResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [confirmRepo, setConfirmRepo] = useState<Repo | null>(null);
  const [isRemoving, startRemovingTransition] = useTransition();

  const syncedFullNames = useMemo(
    () => new Set(repos.map((repo) => `${repo.owner}/${repo.name}`)),
    [repos],
  );

  const filteredResults = useMemo(
    () => results.filter((repo) => !syncedFullNames.has(repo.fullName)),
    [results, syncedFullNames],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
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
          setSearchError(err instanceof Error ? err.message : "Search failed");
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
        selected: repos.length === 0,
      });
      await queryClient.invalidateQueries(convexQuery(api.repos.list));
      setQuery("");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConfirmRemove = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!confirmRepo) return;

    const repoId = confirmRepo._id;
    const shouldClose = repos.length <= 1;

    startRemovingTransition(async () => {
      const result = await removeRepo({ id: repoId });
      if (result.removed) {
        await queryClient.invalidateQueries(convexQuery(api.repos.list));
      }
      setConfirmRepo(null);
      if (shouldClose) onOpenChange(false);
    });
  };

  const showIdleHint = query.trim().length < MIN_QUERY_LENGTH;
  const showEmpty =
    !showIdleHint &&
    !isSearching &&
    !searchError &&
    debouncedQuery.length >= MIN_QUERY_LENGTH &&
    filteredResults.length === 0;

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Repositories"
        description="Add or remove tracked GitHub repositories"
        showCloseButton
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search public repositories..."
            value={query}
            onValueChange={setQuery}
            disabled={isSyncing || isRemoving}
          />
          <CommandList>
            {repos.length > 0 && (
              <>
                <CommandGroup heading="Synced">
                  {repos.map((repo) => (
                    <div
                      key={repo._id}
                      className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5"
                    >
                      <span className="min-w-0 truncate text-sm">
                        {repo.owner}/{repo.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${repo.owner}/${repo.name}`}
                        disabled={isSyncing || isRemoving}
                        onClick={() => setConfirmRepo(repo)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
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
            {!showIdleHint && !isSearching && !searchError && filteredResults.length > 0 && (
              <CommandGroup heading="GitHub">
                {filteredResults.map((repo) => (
                  <CommandItem
                    key={repo.fullName}
                    value={repo.fullName}
                    disabled={isSyncing || isRemoving}
                    onSelect={() => void handleSelect(repo)}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">{repo.fullName}</span>
                      {repo.description && (
                        <span className="text-muted-foreground truncate text-xs">
                          {repo.description}
                        </span>
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

      <AlertDialog
        open={confirmRepo !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmRepo(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {confirmRepo?.owner}/{confirmRepo?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This repository will be removed from your list. You can add it again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isRemoving}
              onClick={handleConfirmRemove}
            >
              {isRemoving ? <Spinner data-icon="inline-start" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
