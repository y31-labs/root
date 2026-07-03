import type {
  FlowCoverageDocument,
  FlowguardFlow,
  CanonicalDigest,
  FlowProposal,
  FlowguardConfig,
} from '#/types';

export const canonicalSerialize = (value: unknown): string => {
  return writeCanonicalValue(value);
};

export const serializeCanonicalJson = (value: unknown): string => {
  return canonicalSerialize(value);
};

export const digestCanonicalJson = (value: unknown): Promise<CanonicalDigest> => {
  return digestCanonicalString(canonicalSerialize(value));
};

export const digestFlowguardFlow = (flow: FlowguardFlow): Promise<CanonicalDigest> => {
  return digestCanonicalJson(flow);
};

export const digestFlowProposal = (proposal: FlowProposal): Promise<CanonicalDigest> => {
  return digestCanonicalJson(proposal);
};

export const digestFlowCoverageDocument = (
  coverage: FlowCoverageDocument,
): Promise<CanonicalDigest> => {
  return digestCanonicalJson(coverage);
};

export const digestFlowguardConfig = (config: FlowguardConfig): Promise<CanonicalDigest> => {
  return digestCanonicalJson(config);
};

const digestCanonicalString = async (value: string): Promise<CanonicalDigest> => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto SHA-256 is not available in this host.');
  }

  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
};

const writeCanonicalValue = (value: unknown): string => {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError('Canonical JSON cannot encode non-finite numbers.');
      }
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'object':
      if (Array.isArray(value)) {
        return `[${value.map((item) => writeCanonicalValue(item)).join(',')}]`;
      }
      return writeCanonicalObject(value as Record<string, unknown>);
    default:
      throw new TypeError(`Canonical JSON cannot encode ${typeof value}.`);
  }
};

const writeCanonicalObject = (value: Record<string, unknown>): string => {
  const entries = Object.keys(value)
    .sort()
    .map((key) => {
      const item = value[key];
      if (item === undefined) {
        throw new TypeError('Canonical JSON cannot encode undefined object fields.');
      }

      return `${JSON.stringify(key)}:${writeCanonicalValue(item)}`;
    });

  return `{${entries.join(',')}}`;
};

const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};
