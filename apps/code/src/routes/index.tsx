import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LoadingView } from "@workspace/ui/components/app/loading-view";
import { useBoolean } from "@workspace/ui/hooks/use-boolean";
import { useMutation } from "convex/react";
import { use, useCallback } from "react";

import { ReposDialog } from "#/components/repos/repos-dialog";
import { RepoSelectorDropdown } from "#/components/repos/repo-selector-dropdown";
import { api } from "#convex/_generated/api";
import type { Id } from "#convex/_generated/dataModel";

export const Route = createFileRoute("/")({
  component: HomePage,
  pendingComponent: LoadingView,
});

function HomePage() {
  const repos = use(useQuery(convexQuery(api.repos.list)).promise) ?? [];

  const selectRepo = useMutation(api.repos.select);

  const { value: open, setValue: setOpen, setTrue } = useBoolean(false);

  const onSelectRepo = useCallback(
    (id: Id<"repos">, selected: boolean) => selectRepo({ id, selected }).then((r) => r.updated),
    [selectRepo],
  );

  return (
    <>
      <div className="relative flex min-h-svh flex-1 flex-col">
        <div className="flex justify-end p-4">
          <RepoSelectorDropdown
            repos={repos}
            onSelectRepo={onSelectRepo}
            onManageRepos={setTrue}
          />
        </div>
      </div>
      <ReposDialog open={open} onOpenChange={setOpen} repos={repos} />
    </>
  );
}
