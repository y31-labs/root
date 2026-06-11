import type { EngineHealth } from '@workspace/code-agent-contracts/engine';

import type { ChatProvider } from '#/lib/chat';
import { localApi } from '#/lib/local-api';

export type ProviderConnectionStatus =
  | 'checking'
  | 'unavailable'
  | 'disconnected'
  | 'connected'
  | 'error';

export interface ChatProviderDefinition {
  id: ChatProvider;
  label: string;
  description: string;
  enabled: boolean;
  installHelp: string;
  connectLabel: string;
  checkHealth: () => Promise<EngineHealth>;
  connect: () => Promise<void>;
}

export const chatProviders: Record<ChatProvider, ChatProviderDefinition> = {
  codex: {
    id: 'codex',
    label: 'Codex',
    description: 'Use the Codex CLI and your ChatGPT account.',
    enabled: true,
    installHelp: 'Install the official Codex CLI, then check the connection again.',
    connectLabel: 'Connect Codex',
    checkHealth: localApi.engineHealth,
    connect: localApi.startCodexLogin,
  },
};

export function getChatProvider(provider: ChatProvider) {
  return chatProviders[provider];
}

export function providerConnectionStatus(
  health: EngineHealth | undefined,
  options: { checking: boolean; error?: string },
): ProviderConnectionStatus {
  if (options.checking) return 'checking';
  if (options.error) return 'error';
  if (!health?.version) return 'unavailable';
  return health.authenticated ? 'connected' : 'disconnected';
}

export function repositoryName(path: string) {
  const normalized = path.replace(/\/+$/, '');
  return normalized.split('/').pop() || path;
}

export function relativeUpdatedAt(updatedAt: number, now = Date.now()) {
  const elapsedSeconds = Math.round((updatedAt - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];

  for (const [unit, seconds] of units) {
    if (Math.abs(elapsedSeconds) >= seconds) {
      return formatter.format(Math.round(elapsedSeconds / seconds), unit);
    }
  }
  return formatter.format(elapsedSeconds, 'second');
}
