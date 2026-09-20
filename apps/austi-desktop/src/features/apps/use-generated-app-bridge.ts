import { useCallback, useEffect, useRef, useState } from 'react';

import {
  isJsonValue,
  type FrameToHostMessage,
  type HostToFrameMessage,
  type JsonValue,
} from '#/features/apps/runtime/protocol';
import type { GeneratedAppRecord, LocalApi } from '#/lib/local-api';

const STATE_SAVE_DELAY_MS = 250;
const STATE_KEY = /^[a-z][a-z0-9._-]{0,79}$/;

export const useGeneratedAppBridge = (api: LocalApi, app: GeneratedAppRecord) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const token = useRef(crypto.randomUUID());
  const stateRef = useRef<Record<string, JsonValue>>({});
  const saveTimeout = useRef<number | undefined>(undefined);
  const stateSavePending = useRef(false);
  const approvedCapabilities = useRef(new Set<string>());
  const [frameReady, setFrameReady] = useState(false);
  const [initialStateLoaded, setInitialStateLoaded] = useState(false);
  const [height, setHeight] = useState(640);
  const [runtimeError, setRuntimeError] = useState<string>();

  const sendToFrame = useCallback(
    (message: HostToFrameMessage) => frame.current?.contentWindow?.postMessage(message, '*'),
    [],
  );

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
  }, [app, frameReady, initialStateLoaded, sendToFrame]);

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
      if (message.type !== 'y31:capability-call') return;
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
  }, [api, app, sendToFrame]);

  return {
    frame,
    height,
    onFrameLoad: () => setFrameReady(true),
    runtimeError,
  };
};
