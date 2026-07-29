import { useEffect, useMemo, useState } from 'react';

import type { GeneratedAppRecord, LocalApi, McpServerSummary } from '#/lib/local-api';

export const useGeneratedAppIntegrations = (
  api: LocalApi,
  permissions: GeneratedAppRecord['permissions'],
) => {
  const requirements = useMemo(
    () =>
      Array.from(
        new Set(
          permissions.flatMap((permission) => {
            const segments = permission.capabilityId.split('.');
            return segments[0] === 'mcp' && segments[1] ? [segments[1]] : [];
          }),
        ),
      ),
    [permissions],
  );
  const [servers, setServers] = useState<McpServerSummary[]>([]);
  const [connectedServers, setConnectedServers] = useState<Set<string>>(() => new Set());
  const [connectingServer, setConnectingServer] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (requirements.length === 0) return;
    let active = true;
    void api
      .listMcpServers()
      .then((availableServers) => {
        if (!active) return;
        setServers(availableServers);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Could not load local app integrations.');
      });
    return () => {
      active = false;
    };
  }, [api, requirements]);

  const connectServer = async (serverName: string) => {
    setConnectingServer(serverName);
    setError(undefined);
    try {
      await api.connectMcpServer(serverName);
      setConnectedServers((current) => new Set(current).add(serverName));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect the MCP integration.');
    } finally {
      setConnectingServer(undefined);
    }
  };

  return { connectedServers, connectingServer, connectServer, error, requirements, servers };
};
