export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const isJsonValue = (value: unknown, depth = 0): value is JsonValue => {
  if (depth > 20) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1));
  if (typeof value !== 'object') return false;
  return Object.values(value).every((item) => isJsonValue(item, depth + 1));
};

export interface LocalAppPermission {
  capabilityId: string;
  effects: Array<'filesystem' | 'network' | 'read' | 'secret' | 'write'>;
  approval: 'always' | 'first-use' | 'never';
}

export interface LocalAppInfo {
  id: string;
  title: string;
  description: string;
  revision: number;
}

export type HostToFrameMessage =
  | {
      type: 'y31:initialize';
      token: string;
      app: LocalAppInfo;
      bundle: string;
      state: Record<string, JsonValue>;
    }
  | {
      type: 'y31:capability-result';
      token: string;
      requestId: string;
      result?: JsonValue;
      error?: string;
    };

export type FrameToHostMessage =
  | { type: 'y31:ready' }
  | { type: 'y31:resize'; token: string; height: number }
  | { type: 'y31:state-set'; token: string; key: string; value: JsonValue }
  | {
      type: 'y31:capability-call';
      token: string;
      requestId: string;
      capabilityId: string;
      input: JsonValue;
    };
