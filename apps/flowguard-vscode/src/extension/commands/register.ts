import { createFlowguardCommandHandlers } from '#/extension/commands/handlers';
import type {
  FlowguardCommandEnvironment,
  FlowguardCommandSelection,
} from '#/extension/commands/types';
import { FLOWGUARD_COMMANDS } from '#/extension/services/constants';
import type { FlowguardHostApi } from '#/extension/services/host-api';
import type { FlowguardServiceContainer } from '#/extension/services/service-container';

export const registerFlowguardCommands = (
  api: FlowguardHostApi,
  services: FlowguardServiceContainer,
  environment: FlowguardCommandEnvironment,
): void => {
  const handlers = createFlowguardCommandHandlers(environment);

  services.addDisposable(
    api.commands.registerCommand(
      FLOWGUARD_COMMANDS.initializeRepository,
      commandAdapter(handlers[FLOWGUARD_COMMANDS.initializeRepository]),
    ),
  );
  services.addDisposable(
    api.commands.registerCommand(
      FLOWGUARD_COMMANDS.refresh,
      commandAdapter(handlers[FLOWGUARD_COMMANDS.refresh]),
    ),
  );
  services.addDisposable(
    api.commands.registerCommand(
      FLOWGUARD_COMMANDS.openFlow,
      commandAdapter(handlers[FLOWGUARD_COMMANDS.openFlow]),
    ),
  );
  services.addDisposable(
    api.commands.registerCommand(
      FLOWGUARD_COMMANDS.reviewProposal,
      commandAdapter(handlers[FLOWGUARD_COMMANDS.reviewProposal]),
    ),
  );
};

const commandAdapter = (
  handler: (selection?: FlowguardCommandSelection) => Promise<void>,
): ((...args: unknown[]) => Promise<void>) => {
  return (selection) => handler(selection as FlowguardCommandSelection | undefined);
};
