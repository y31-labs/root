export type LocalRunEvent =
  | {
      type: 'transition';
      runId: string;
      status: 'preparing' | 'implementing' | 'verifying' | 'repairing';
      attempt?: number;
    }
  | {
      type: 'gate';
      runId: string;
      kind:
        | 'install'
        | 'typecheck'
        | 'lint'
        | 'build'
        | 'unit'
        | 'integration'
        | 'authSetup'
        | 'browser';
      status: 'passed' | 'failed' | 'skipped';
      required: boolean;
      attempt: number;
      durationMs: number;
      exitCode?: number;
    }
  | {
      type: 'completed';
      runId: string;
      status: 'verified' | 'failed' | 'cancelled' | 'needs_input';
      changedFileCount: number;
      hasLocalPatch: boolean;
      terminalReason?: string;
    };

export function gateMutationArgs(event: Extract<LocalRunEvent, { type: 'gate' }>) {
  return {
    kind: event.kind,
    status: event.status,
    required: event.required,
    attempt: event.attempt,
    durationMs: event.durationMs,
    exitCode: event.exitCode,
  };
}

