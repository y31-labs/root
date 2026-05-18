import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/ui/alert-dialog';
import { Button } from '@workspace/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/ui/dropdown-menu';
import { Spinner } from '@workspace/ui/components/ui/spinner';
import { IconDotsVertical, IconExternalLink, IconTrash } from '@tabler/icons-react';
import type { MouseEvent } from 'react';
import { useState, useTransition } from 'react';

type TickerActionsMenuProps = {
  symbol: string;
  label?: string | null;
  homepageUrl?: string;
  onRemove: () => Promise<void>;
};

export function TickerActionsMenu({
  symbol,
  label,
  homepageUrl,
  onRemove,
}: TickerActionsMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isRemoving, startRemovingTransition] = useTransition();

  const displayName = label ?? symbol;

  const handleConfirm = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    startRemovingTransition(async () => {
      await onRemove();
      setConfirmOpen(false);
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label={`${displayName} actions`}
          >
            <IconDotsVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          {homepageUrl ? (
            <>
              <DropdownMenuItem asChild>
                <a href={homepageUrl} target="_blank" rel="noreferrer">
                  <IconExternalLink />
                  Visit site
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault();
              setConfirmOpen(true);
            }}
          >
            <IconTrash />
            Remove from watchlist
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              {symbol} will be removed from your watchlist. You can add it back at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isRemoving} onClick={handleConfirm}>
              {isRemoving ? <Spinner data-icon="inline-start" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
