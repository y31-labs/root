import { useCallback, useState } from 'react';

import type { JsonValue, LocalAppInfo } from '#/features/apps/runtime/protocol';

interface LocalAppBridge {
  app: LocalAppInfo;
  initialState: Record<string, JsonValue>;
  invoke: (capabilityId: string, input: JsonValue) => Promise<JsonValue>;
  setState: (key: string, value: JsonValue) => void;
}

let bridge: LocalAppBridge | undefined;
const STATE_KEY = /^[a-z][a-z0-9._-]{0,79}$/;

export const configureLocalAppBridge = (value: LocalAppBridge) => {
  bridge = value;
};

const requireBridge = () => {
  if (!bridge) throw new Error('The local app host is not ready.');
  return bridge;
};

export const useAppInfo = () => requireBridge().app;

export const usePersistentState = <Value extends JsonValue>(key: string, initialValue: Value) => {
  if (!STATE_KEY.test(key)) {
    throw new Error('Persistent state keys must be lowercase entity ids.');
  }
  const runtime = requireBridge();
  const [value, setValue] = useState<Value>(() => {
    const stored = runtime.initialState[key];
    return (stored === undefined ? initialValue : stored) as Value;
  });

  const update = useCallback(
    (next: Value | ((current: Value) => Value)) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? next(current) : next;
        runtime.setState(key, resolved);
        return resolved;
      });
    },
    [key, runtime],
  );

  return [value, update] as const;
};

export const useCapability = <Result extends JsonValue = JsonValue>(capabilityId: string) => {
  const runtime = requireBridge();
  const [data, setData] = useState<Result>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const run = useCallback(
    async (input: JsonValue = {}) => {
      setLoading(true);
      setError(undefined);
      try {
        const result = (await runtime.invoke(capabilityId, input)) as Result;
        setData(result);
        return result;
      } catch (runError) {
        const message = runError instanceof Error ? runError.message : 'Capability call failed.';
        setError(message);
        throw runError;
      } finally {
        setLoading(false);
      }
    },
    [capabilityId, runtime],
  );

  return { data, error, loading, run } as const;
};
