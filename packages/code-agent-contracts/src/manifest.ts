export const verificationGateKinds = [
  'install',
  'typecheck',
  'lint',
  'build',
  'unit',
  'integration',
  'coverage',
  'accessibility',
  'e2e',
  'visual',
] as const;

export type VerificationGateKind = (typeof verificationGateKinds)[number];
export type VerificationNetworkPolicy = 'enabled' | 'disabled';
export const verifierBunVersion = '1.3.5';

export interface VerificationCommand {
  command: string;
  args: string[];
  timeoutMs: number;
  required: boolean;
  network: VerificationNetworkPolicy;
  env?: Record<string, string>;
}

export interface AppServerConfig {
  command: string;
  args: string[];
  timeoutMs: number;
  healthUrl: string;
  healthTimeoutMs: number;
  browserBaseUrl: string;
  env?: Record<string, string>;
}

export interface VerificationManifest {
  version: 2;
  runtime: {
    packageManager: 'bun';
    bunVersion: string;
  };
  gates: Partial<Record<VerificationGateKind, VerificationCommand>>;
  appServer?: AppServerConfig;
}

const commandKeys = new Set(['command', 'args', 'timeoutMs', 'required', 'network', 'env']);
const serverKeys = new Set([
  'command',
  'args',
  'timeoutMs',
  'healthUrl',
  'healthTimeoutMs',
  'browserBaseUrl',
  'env',
]);
const rootKeys = new Set(['version', 'runtime', 'gates', 'appServer']);

export function parseVerificationManifest(value: unknown): VerificationManifest {
  const root = object(value, 'manifest');
  rejectUnknown(root, rootKeys, 'manifest');
  if (root.version !== 2) throw new Error('manifest.version must be 2');

  const runtime = object(root.runtime, 'manifest.runtime');
  rejectUnknown(runtime, new Set(['packageManager', 'bunVersion']), 'manifest.runtime');
  if (runtime.packageManager !== 'bun') {
    throw new Error('manifest.runtime.packageManager must be bun');
  }

  const bunVersion = nonEmptyString(runtime.bunVersion, 'manifest.runtime.bunVersion');
  if (bunVersion !== verifierBunVersion) {
    throw new Error(
      `manifest.runtime.bunVersion must match the pinned verifier (${verifierBunVersion})`,
    );
  }
  const rawGates = object(root.gates, 'manifest.gates');
  const gates: Partial<Record<VerificationGateKind, VerificationCommand>> = {};

  for (const [kind, command] of Object.entries(rawGates)) {
    if (!verificationGateKinds.includes(kind as VerificationGateKind)) {
      throw new Error(`Unsupported verification gate: ${kind}`);
    }
    gates[kind as VerificationGateKind] = parseCommand(
      command,
      kind as VerificationGateKind,
      `manifest.gates.${kind}`,
    );
  }

  if (!Object.values(gates).some((gate) => gate?.required)) {
    throw new Error('At least one verification gate must be required');
  }

  return {
    version: 2,
    runtime: { packageManager: 'bun', bunVersion },
    gates,
    appServer:
      root.appServer === undefined
        ? undefined
        : parseAppServer(root.appServer, 'manifest.appServer'),
  };
}

export function defaultManifest(bunVersion: string, scripts: Record<string, string>) {
  if (bunVersion !== verifierBunVersion) {
    throw new Error(`Bun ${bunVersion} does not match the pinned verifier (${verifierBunVersion})`);
  }
  const gate = (script: string | undefined, timeoutMs: number): VerificationCommand | undefined =>
    script
      ? {
          command: 'bun',
          args: ['run', script],
          timeoutMs,
          required: true,
          network: 'disabled',
        }
      : undefined;
  const unitScript = scripts['test:unit'] ? 'test:unit' : scripts.test ? 'test' : undefined;

  return parseVerificationManifest({
    version: 2,
    runtime: { packageManager: 'bun', bunVersion },
    gates: Object.fromEntries(
      Object.entries({
        install: {
          command: 'bun',
          args: ['install', '--frozen-lockfile'],
          timeoutMs: 300_000,
          required: true,
          network: 'enabled',
        },
        typecheck: gate(scripts.typecheck ? 'typecheck' : undefined, 180_000),
        lint: gate(scripts.lint ? 'lint' : undefined, 180_000),
        build: gate(scripts.build ? 'build' : undefined, 300_000),
        unit: gate(unitScript, 300_000),
        integration: gate(scripts['test:integration'] ? 'test:integration' : undefined, 600_000),
        coverage: gate(scripts['test:coverage'] ? 'test:coverage' : undefined, 600_000),
        accessibility: gate(
          scripts['test:accessibility'] ? 'test:accessibility' : undefined,
          600_000,
        ),
        e2e: gate(scripts['test:e2e'] ? 'test:e2e' : undefined, 600_000),
        visual: gate(scripts['test:visual'] ? 'test:visual' : undefined, 600_000),
      }).filter((entry) => entry[1] !== undefined),
    ),
  });
}

export function manifestFingerprintPaths(packagePaths: readonly string[] = []) {
  return [
    'bun.lock',
    'package.json',
    'bunfig.toml',
    ...packagePaths.map((path) => `${path.replace(/\/+$/, '')}/package.json`),
  ];
}

function parseCommand(
  value: unknown,
  kind: VerificationGateKind,
  path: string,
): VerificationCommand {
  const command = object(value, path);
  rejectUnknown(command, commandKeys, path);
  const parsed = {
    command: executable(command.command, `${path}.command`),
    args: stringArray(command.args, `${path}.args`),
    timeoutMs: timeout(command.timeoutMs, `${path}.timeoutMs`),
    required: boolean(command.required, `${path}.required`),
    network: network(command.network, `${path}.network`),
    env: command.env === undefined ? undefined : environment(command.env, `${path}.env`),
  };

  if (parsed.network === 'enabled') {
    const validInstall =
      kind === 'install' &&
      parsed.command === 'bun' &&
      parsed.args.length === 2 &&
      parsed.args[0] === 'install' &&
      parsed.args[1] === '--frozen-lockfile';
    if (!validInstall) {
      throw new Error('Only `bun install --frozen-lockfile` may enable network access');
    }
  }

  return parsed;
}

function parseAppServer(value: unknown, path: string): AppServerConfig {
  const server = object(value, path);
  rejectUnknown(server, serverKeys, path);
  const healthUrl = localhostUrl(server.healthUrl, `${path}.healthUrl`);
  const browserBaseUrl = localhostUrl(server.browserBaseUrl, `${path}.browserBaseUrl`);

  if (new URL(healthUrl).origin !== new URL(browserBaseUrl).origin) {
    throw new Error(`${path}.healthUrl and browserBaseUrl must use the same origin`);
  }

  return {
    command: executable(server.command, `${path}.command`),
    args: stringArray(server.args, `${path}.args`),
    timeoutMs: timeout(server.timeoutMs, `${path}.timeoutMs`),
    healthUrl,
    healthTimeoutMs: timeout(server.healthTimeoutMs, `${path}.healthTimeoutMs`),
    browserBaseUrl,
    env: server.env === undefined ? undefined : environment(server.env, `${path}.env`),
  };
}

function localhostUrl(value: unknown, path: string) {
  const result = nonEmptyString(value, path);
  const url = new URL(result);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(`${path} must use an http localhost origin`);
  }
  return result;
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

function network(value: unknown, path: string): VerificationNetworkPolicy {
  if (value !== 'enabled' && value !== 'disabled') {
    throw new Error(`${path} must be enabled or disabled`);
  }
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
