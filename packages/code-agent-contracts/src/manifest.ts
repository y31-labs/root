export const verificationGateKinds = [
  'install',
  'typecheck',
  'lint',
  'build',
  'unit',
  'integration',
  'authSetup',
  'browser',
] as const;

export type VerificationGateKind = (typeof verificationGateKinds)[number];

export interface VerificationCommand {
  command: string;
  args: string[];
  timeoutMs: number;
  required: boolean;
  env?: Record<string, string>;
}

export interface AppServerConfig {
  command: string;
  args: string[];
  timeoutMs: number;
  healthUrl: string;
  healthTimeoutMs: number;
  env?: Record<string, string>;
}

export interface VerificationManifest {
  version: 1;
  runtime: {
    packageManager: 'bun';
    bunVersion: string;
  };
  gates: Partial<Record<VerificationGateKind, VerificationCommand>>;
  appServer?: AppServerConfig;
}

const commandKeys = new Set(['command', 'args', 'timeoutMs', 'required', 'env']);
const serverKeys = new Set(['command', 'args', 'timeoutMs', 'healthUrl', 'healthTimeoutMs', 'env']);
const rootKeys = new Set(['version', 'runtime', 'gates', 'appServer']);

export function parseVerificationManifest(value: unknown): VerificationManifest {
  const root = object(value, 'manifest');
  rejectUnknown(root, rootKeys, 'manifest');
  if (root.version !== 1) throw new Error('manifest.version must be 1');

  const runtime = object(root.runtime, 'manifest.runtime');
  rejectUnknown(runtime, new Set(['packageManager', 'bunVersion']), 'manifest.runtime');
  if (runtime.packageManager !== 'bun') {
    throw new Error('manifest.runtime.packageManager must be bun');
  }

  const bunVersion = nonEmptyString(runtime.bunVersion, 'manifest.runtime.bunVersion');
  const rawGates = object(root.gates, 'manifest.gates');
  const gates: Partial<Record<VerificationGateKind, VerificationCommand>> = {};

  for (const [kind, command] of Object.entries(rawGates)) {
    if (!verificationGateKinds.includes(kind as VerificationGateKind)) {
      throw new Error(`Unsupported verification gate: ${kind}`);
    }
    gates[kind as VerificationGateKind] = parseCommand(command, `manifest.gates.${kind}`);
  }

  if (!Object.values(gates).some((gate) => gate?.required)) {
    throw new Error('At least one verification gate must be required');
  }

  return {
    version: 1,
    runtime: { packageManager: 'bun', bunVersion },
    gates,
    appServer:
      root.appServer === undefined
        ? undefined
        : parseAppServer(root.appServer, 'manifest.appServer'),
  };
}

export function defaultManifest(bunVersion: string, scripts: Record<string, string>) {
  const gate = (script: string, timeoutMs: number): VerificationCommand | undefined =>
    scripts[script]
      ? { command: 'bun', args: ['run', script], timeoutMs, required: true }
      : undefined;

  return parseVerificationManifest({
    version: 1,
    runtime: { packageManager: 'bun', bunVersion },
    gates: Object.fromEntries(
      Object.entries({
        install: {
          command: 'bun',
          args: ['install', '--frozen-lockfile'],
          timeoutMs: 300_000,
          required: true,
        },
        typecheck: gate('typecheck', 180_000),
        lint: gate('lint', 180_000),
        build: gate('build', 300_000),
        unit: gate('test', 300_000),
        integration: gate('test:integration', 600_000),
        browser: gate('test:e2e', 600_000),
      }).filter((entry) => entry[1] !== undefined),
    ),
  });
}

function parseCommand(value: unknown, path: string): VerificationCommand {
  const command = object(value, path);
  rejectUnknown(command, commandKeys, path);

  return {
    command: executable(command.command, `${path}.command`),
    args: stringArray(command.args, `${path}.args`),
    timeoutMs: timeout(command.timeoutMs, `${path}.timeoutMs`),
    required: boolean(command.required, `${path}.required`),
    env: command.env === undefined ? undefined : environment(command.env, `${path}.env`),
  };
}

function parseAppServer(value: unknown, path: string): AppServerConfig {
  const server = object(value, path);
  rejectUnknown(server, serverKeys, path);
  const healthUrl = nonEmptyString(server.healthUrl, `${path}.healthUrl`);
  const url = new URL(healthUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${path}.healthUrl must use http or https`);
  }

  return {
    command: executable(server.command, `${path}.command`),
    args: stringArray(server.args, `${path}.args`),
    timeoutMs: timeout(server.timeoutMs, `${path}.timeoutMs`),
    healthUrl,
    healthTimeoutMs: timeout(server.healthTimeoutMs, `${path}.healthTimeoutMs`),
    env: server.env === undefined ? undefined : environment(server.env, `${path}.env`),
  };
}

function executable(value: unknown, path: string) {
  const result = nonEmptyString(value, path);
  if (result.includes('/') || result.includes('\\') || result.includes('\0')) {
    throw new Error(`${path} must be a PATH executable name`);
  }
  return result;
}

function environment(value: unknown, path: string) {
  const raw = object(value, path);
  const result: Record<string, string> = {};
  for (const [key, envValue] of Object.entries(raw)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`${path}.${key} is not a valid env name`);
    result[key] = nonEmptyString(envValue, `${path}.${key}`);
  }
  return result;
}

function stringArray(value: unknown, path: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${path} must be an array of strings`);
  }
  return value;
}

function timeout(value: unknown, path: string) {
  if (!Number.isInteger(value) || Number(value) < 1_000 || Number(value) > 1_800_000) {
    throw new Error(`${path} must be an integer between 1000 and 1800000`);
  }
  return Number(value);
}

function boolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
  return value;
}

function nonEmptyString(value: unknown, path: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknown(value: Record<string, unknown>, keys: Set<string>, path: string) {
  const unknown = Object.keys(value).find((key) => !keys.has(key));
  if (unknown) throw new Error(`${path}.${unknown} is not supported`);
}
