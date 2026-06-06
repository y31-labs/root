import { convexQuery, useConvexAction } from '@convex-dev/react-query';
import { useMutation } from '@tanstack/react-query';
import { useDebounceValue } from '@workspace/ui/hooks/use-debounce-value';
import { useEffect } from 'react';

import { DEBOUNCE_MS } from '#/lib/const';
import { api } from '#convex/_generated/api.js';

export const repoQueries = {
  list: convexQuery(api.repos.list, {}),
};

export const githubInstallationsQueries = {
  count: convexQuery(api.githubInstallations.count, {}),
};

export const useSearchRepos = (query: string, enabled = true, minQueryLength: number) => {
  const [debounced, setDebounced] = useDebounceValue(query, DEBOUNCE_MS);
  const searchRepos = useConvexAction(api.githubActions.searchRepos);
  const { mutate, ...rest } = useMutation({
    mutationFn: () => searchRepos({ query: debounced }),
  });

  useEffect(() => setDebounced(query.trim()), [query, setDebounced]);

  useEffect(() => {
    if (enabled && debounced.length >= minQueryLength) mutate();
  }, [enabled, debounced, minQueryLength, mutate]);

  return rest;
};
