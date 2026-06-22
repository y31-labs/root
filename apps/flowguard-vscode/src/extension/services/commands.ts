import { FLOWGUARD_COMMANDS, type FlowguardCommandId } from '#/extension/services/constants';
import type { FlowguardHostApi } from '#/extension/services/host-api';
import type { FlowguardServiceContainer } from '#/extension/services/service-container';

interface PlaceholderCommand {
  readonly id: FlowguardCommandId;
  readonly placeholderMessage: string;
}

export const PLACEHOLDER_COMMANDS: readonly PlaceholderCommand[] = [
  {
    id: FLOWGUARD_COMMANDS.initializeRepository,
    placeholderMessage: 'Flowguard repository initialization is not implemented yet.',
  },
  {
    id: FLOWGUARD_COMMANDS.openFlow,
    placeholderMessage: 'Flowguard graph opening will be enabled after workspace discovery lands.',
  },
  {
    id: FLOWGUARD_COMMANDS.refresh,
    placeholderMessage: 'Flowguard refresh will be enabled after workspace discovery lands.',
  },
  {
    id: FLOWGUARD_COMMANDS.showAffectedFlows,
    placeholderMessage: 'Flowguard impact analysis is not implemented yet.',
  },
  {
    id: FLOWGUARD_COMMANDS.reviewProposal,
    placeholderMessage: 'Flowguard proposal review is not implemented yet.',
  },
  {
    id: FLOWGUARD_COMMANDS.acceptProposal,
    placeholderMessage: 'Flowguard proposal acceptance is not implemented yet.',
  },
  {
    id: FLOWGUARD_COMMANDS.rejectProposal,
    placeholderMessage: 'Flowguard proposal rejection is not implemented yet.',
  },
];

export const registerPlaceholderCommands = (
  api: FlowguardHostApi,
  services: FlowguardServiceContainer,
): void => {
  for (const command of PLACEHOLDER_COMMANDS) {
    services.addDisposable(
      api.commands.registerCommand(command.id, () =>
        api.window.showInformationMessage(command.placeholderMessage),
      ),
    );
  }
};
