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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui/components/ui/tooltip';
import { Download, LoaderCircle } from 'lucide-react';

export type AppUpdatePhase = 'available' | 'downloading' | 'ready';

interface AppUpdateNoticeViewProps {
  activeTaskCount: number | null;
  error: string;
  onBeginUpdate: () => void;
  onDismissRunningTasks: () => void;
  onStopTasksAndUpdate: () => void;
  phase: AppUpdatePhase;
  stoppingTasks: boolean;
}

export function AppUpdateNoticeView({
  activeTaskCount,
  error,
  onBeginUpdate,
  onDismissRunningTasks,
  onStopTasksAndUpdate,
  phase,
  stoppingTasks,
}: AppUpdateNoticeViewProps) {
  const taskPromptOpen = activeTaskCount !== null;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label='Update'
                className='size-8 group-data-[collapsible=icon]:opacity-0'
                disabled={phase === 'downloading'}
                onClick={onBeginUpdate}
                size='icon'
                variant='default'
              >
                <Download />
              </Button>
            }
          />
          <TooltipContent side='top'>Update</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {error ? (
        <p className='sr-only' role='alert'>
          {error}
        </p>
      ) : null}

      <AlertDialog
        open={taskPromptOpen}
        onOpenChange={(open) => {
          if (!open) onDismissRunningTasks();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {activeTaskCount === 1 ? 'A Codex task is running' : 'Codex tasks are running'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {activeTaskCount === 1
                ? 'Stop the task before updating Austi, or wait for it to finish.'
                : `Stop all ${activeTaskCount} tasks before updating Austi, or wait for them to finish.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stoppingTasks}>Wait</AlertDialogCancel>
            <AlertDialogAction disabled={stoppingTasks} onClick={onStopTasksAndUpdate}>
              {stoppingTasks ? <LoaderCircle className='animate-spin' /> : null}
              Stop {activeTaskCount === 1 ? 'task' : 'tasks'} and update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
