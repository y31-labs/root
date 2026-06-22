import { registerPlaceholderCommands } from '#/extension/services/commands';
import type { FlowguardHostApi, ExtensionContextLike } from '#/extension/services/host-api';
import { registerPlaceholderProviders } from '#/extension/services/placeholder-providers';
import { FlowguardServiceContainer } from '#/extension/services/service-container';

export const activateFlowguardHost = (
  api: FlowguardHostApi,
  context: ExtensionContextLike,
): FlowguardServiceContainer => {
  const services = new FlowguardServiceContainer(api.workspace.workspaceFolders);

  registerPlaceholderCommands(api, services);
  registerPlaceholderProviders(api, services);

  context.subscriptions.push(services);

  return services;
};
