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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { Spinner } from "@workspace/ui/components/ui/spinner";
import { useMutation } from "convex/react";
import { Trash2 } from "lucide-react";
import type { MouseEvent } from "react";
import { useState, useTransition } from "react";

import { api } from "#convex/_generated/api";
import type { Id } from "#convex/_generated/dataModel";

type Repo = {
  _id: Id<"repos">;
  owner: string;
  name: string;
};

interface ManageReposDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repos: Repo[];
}

export function ManageReposDialog({ open, onOpenChange, repos }: ManageReposDialogProps) {
  const queryClient = useQueryClient();
  const removeRepo = useMutation(api.repos.remove);

  const [confirmRepo, setConfirmRepo] = useState<Repo | null>(null);
  const [isRemoving, startRemovingTransition] = useTransition();

  const handleConfirmRemove = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!confirmRepo) return;

    const repoId = confirmRepo._id;
    startRemovingTransition(async () => {
      const result = await removeRepo({ id: repoId });
      if (result.removed) {
        await queryClient.invalidateQueries(convexQuery(api.repos.list));
        await queryClient.invalidateQueries(convexQuery(api.settings.listSelectedRepoIds));
      }
      setConfirmRepo(null);
      if (repos.length <= 1) onOpenChange(false);
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage repos</DialogTitle>
            <DialogDescription>Remove repositories you no longer want to track.</DialogDescription>
          </DialogHeader>
          {repos.length === 0 ? (
            <p className="text-muted-foreground text-sm">No repositories yet.</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {repos.map((repo) => (
                <li
                  key={repo._id}
                  className="flex items-center justify-between gap-2 rounded-md px-1 py-1"
                >
                  <span className="min-w-0 truncate text-sm">
                    {repo.owner}/{repo.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${repo.owner}/${repo.name}`}
                    onClick={() => setConfirmRepo(repo)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

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
