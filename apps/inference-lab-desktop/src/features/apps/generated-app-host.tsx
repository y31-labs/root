import { Button } from '@workspace/ui/components/ui/button';
import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  FrameToHostMessage,
  HostToFrameMessage,
  JsonValue,
} from '#/features/apps/runtime/protocol';
import type { GeneratedAppRecord, LocalApi, McpServerSummary } from '#/lib/local-api';

const STATE_SAVE_DELAY_MS = 250;
const STATE_KEY = /^[a-z][a-z0-9._-]{0,79}$/;

export function GeneratedAppHost({ api, app }: { api: LocalApi; app: GeneratedAppRecord }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const token = useRef(crypto.randomUUID());
  const stateRef = useRef<Record<string, JsonValue>>({});
  const saveTimeout = useRef<number | undefined>(undefined);
  const stateSavePending = useRef(false);
  const approvedCapabilities = useRef(new Set<string>());
  const [frameReady, setFrameReady] = useState(false);
  const [initialStateLoaded, setInitialStateLoaded] = useState(false);
  const [height, setHeight] = useState(640);
  const [mcpServers, setMcpServers] = useState<McpServerSummary[]>([]);
  const [connectedServers, setConnectedServers] = useState<Set<string>>(() => new Set());
  const [connectingServer, setConnectingServer] = useState<string>();
  const [integrationError, setIntegrationError] = useState<string>();
  const [runtimeError, setRuntimeError] = useState<string>();
  const mcpRequirements = useMemo(
    () =>
      Array.from(
        new Set(
          app.permissions.flatMap((permission) => {
            const segments = permission.capabilityId.split('.');
            return segments[0] === 'mcp' && segments[1] ? [segments[1]] : [];
          }),
        ),
      ),
    [app.permissions],
  );

  const sendToFrame = (message: HostToFrameMessage) =>
    frame.current?.contentWindow?.postMessage(message, '*');

  useEffect(() => {
    let active = true;
    void api
      .getGeneratedAppState(app.id)
      .then((state) => {
        if (!active) return;
        stateRef.current = state;
        setInitialStateLoaded(true);
        setRuntimeError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRuntimeError(error instanceof Error ? error.message : 'Could not load local app state.');
      });
    return () => {
      active = false;
    };
  }, [api, app.id]);

  useEffect(() => {
    if (!frameReady || !initialStateLoaded) return;
    sendToFrame({
      type: 'y31:initialize',
      token: token.current,
      app: {
        id: app.id,
        title: app.title,
        description: app.description,
        revision: app.revision,
      },
      bundle: app.bundle,
      state: stateRef.current,
    });
  }, [app, frameReady, initialStateLoaded]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<FrameToHostMessage>) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = event.data;
      if (!message || typeof message !== 'object' || !('type' in message)) return;
      if (message.type === 'y31:ready') {
        setFrameReady(true);
        return;
      }
      if (message.token !== token.current) return;
      if (message.type === 'y31:resize') {
        if (!Number.isFinite(message.height)) return;
        setHeight(Math.max(320, Math.min(message.height, 5_000)));
        return;
      }
      if (message.type === 'y31:state-set') {
        if (!STATE_KEY.test(message.key) || !isJsonValue(message.value)) return;
        stateRef.current = { ...stateRef.current, [message.key]: message.value };
        stateSavePending.current = true;
        window.clearTimeout(saveTimeout.current);
        saveTimeout.current = window.setTimeout(() => {
          stateSavePending.current = false;
          void api
            .saveGeneratedAppState(app.id, app.revision, stateRef.current)
            .then(() => setRuntimeError(undefined))
            .catch((error: unknown) => {
              setRuntimeError(
                error instanceof Error ? error.message : 'Could not save local app state.',
              );
            });
        }, STATE_SAVE_DELAY_MS);
        return;
      }
      if (message.type === 'y31:capability-call') {
        if (
          typeof message.capabilityId !== 'string' ||
          typeof message.requestId !== 'string' ||
          !isJsonValue(message.input)
        ) {
          return;
        }
        const permission = app.permissions.find(
          (candidate) => candidate.capabilityId === message.capabilityId,
        );
        if (!permission) {
          sendToFrame({
            type: 'y31:capability-result',
            token: token.current,
            requestId: message.requestId,
            error: 'This app is not allowed to use that capability.',
          });
          return;
        }
        let approved = permission.approval === 'never';
        if (
          permission.approval === 'first-use' &&
          approvedCapabilities.current.has(permission.capabilityId)
        ) {
          approved = true;
        }
        if (!approved) {
          const effects = permission.effects.join(', ');
          approved = window.confirm(
            `Allow “${app.title}” to use ${permission.capabilityId}?\n\nEffects: ${effects}`,
          );
          if (approved && permission.approval === 'first-use') {
            approvedCapabilities.current.add(permission.capabilityId);
          }
        }
        if (!approved) {
          sendToFrame({
            type: 'y31:capability-result',
            token: token.current,
            requestId: message.requestId,
            error: 'The capability call was not approved.',
          });
          return;
        }
        void api
          .invokeGeneratedAppCapability(
            app.id,
            app.revision,
            message.capabilityId,
            message.input,
            permission.approval !== 'never',
          )
          .then((result) => {
            sendToFrame({
              type: 'y31:capability-result',
              token: token.current,
              requestId: message.requestId,
              result,
            });
          })
          .catch((error: unknown) => {
            sendToFrame({
              type: 'y31:capability-result',
              token: token.current,
              requestId: message.requestId,
              error: error instanceof Error ? error.message : 'Capability call failed.',
            });
          });
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(saveTimeout.current);
      if (stateSavePending.current) {
        stateSavePending.current = false;
        void api
          .saveGeneratedAppState(app.id, app.revision, stateRef.current)
          .catch(() => undefined);
      }
    };
  }, [api, app.id, app.revision]);

  useEffect(() => {
    if (mcpRequirements.length === 0) return;
    let active = true;
    void api
      .listMcpServers()
      .then((servers) => {
        if (!active) return;
        setMcpServers(servers);
        setIntegrationError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setIntegrationError(
          error instanceof Error ? error.message : 'Could not load local app integrations.',
        );
      });
    return () => {
      active = false;
    };
  }, [api, mcpRequirements]);

  const connectServer = async (serverName: string) => {
    setConnectingServer(serverName);
    setIntegrationError(undefined);
    try {
      await api.connectMcpServer(serverName);
      setConnectedServers((current) => new Set(current).add(serverName));
    } catch (error) {
      setIntegrationError(
        error instanceof Error ? error.message : 'Could not connect the MCP integration.',
      );
    } finally {
      setConnectingServer(undefined);
    }
  };

  return (
    <div className='min-h-full'>
      {mcpRequirements.length > 0 ? (
        <section aria-label='Required integrations' className='border-b px-6 py-4 md:px-10'>
          <div className='flex flex-wrap items-center gap-x-5 gap-y-2'>
            <p className='text-sm font-medium'>Integrations</p>
            {mcpRequirements.map((serverName) => {
              const server = mcpServers.find((candidate) => candidate.name === serverName);
              const connected = connectedServers.has(serverName);
              return (
                <div className='flex items-center gap-2 text-sm' key={serverName}>
                  <span className='text-muted-foreground'>{serverName}</span>
                  {connected || server?.authentication === 'none' ? (
                    <span className='text-success'>Available</span>
                  ) : server?.enabled && server.authentication === 'oauth' ? (
                    <Button
                      disabled={connectingServer !== undefined}
                      size='xs'
                      variant='outline'
                      onClick={() => void connectServer(serverName)}
                    >
                      {connectingServer === serverName ? 'Connecting…' : 'Connect'}
                    </Button>
                  ) : (
                    <span className='text-warning'>Configure in Codex</span>
                  )}
                </div>
              );
            })}
          </div>
          {integrationError ? (
            <p className='mt-2 text-sm text-danger' role='alert'>
              {integrationError}
            </p>
          ) : null}
        </section>
      ) : null}
      {runtimeError ? (
        <p className='border-b px-6 py-3 text-sm text-danger md:px-10' role='alert'>
          {runtimeError}
        </p>
      ) : null}
      <iframe
        ref={frame}
        sandbox='allow-scripts'
        src='/generated-app-frame.html'
        title={app.title}
        className='block w-full border-0 bg-background'
        style={{ height }}
        onLoad={() => setFrameReady(true)}
      />
    </div>
  );
}

const isJsonValue = (value: unknown, depth = 0): value is JsonValue => {
  if (depth > 20) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1));
  if (typeof value !== 'object') return false;
  return Object.values(value).every((item) => isJsonValue(item, depth + 1));
};
