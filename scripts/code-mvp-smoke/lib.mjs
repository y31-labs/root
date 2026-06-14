import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(SCRIPT_DIRECTORY, 'config.json');
const REPORT_FILE = 'report.json';
const REPORT_CHECKSUM_FILE = 'report.json.sha256';
const REPORT_DIRECTORY_MARKER = '.code-mvp-smoke-report-dir';
export const PACKAGED_CODE_EXECUTABLE_RELATIVE_PATH = join(
  'apps',
  'code-desktop',
  'src-tauri',
  'target',
  'release',
  'bundle',
  'macos',
  'Code.app',
  'Contents',
  'MacOS',
  'code-desktop',
);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const IMAGE_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40,64}$/;
const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_ARTIFACT_COUNT = 16;
const MAX_ARTIFACT_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_ARTIFACT_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_ARTIFACT_KINDS = new Set(['screenshot', 'trace', 'verification-evidence']);
const ALLOWED_CHECKS = new Set([
  'accepted_digest_matches_verified',
  'authoritative_e2e',
  'cancellation_observed',
  'continuation_or_discard_completed',
  'dirty_source_preserved',
  'persistent_thread',
  'reverified',
  'screenshot_response',
  'source_state_unchanged',
  'stale_acceptance_blocked',
]);
const SMOKE_CHILD_ENVIRONMENT_KEYS = [
  'HOME',
  'CODEX_HOME',
  'PATH',
  'TMPDIR',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'TZ',
  '__CF_USER_TEXT_ENCODING',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
];

export async function resolvePackagedCodeExecutable(
  repositoryRoot,
  { verifyDistribution = true } = {},
) {
  const root = await realpath(repositoryRoot);
  const executablePath = resolve(root, PACKAGED_CODE_EXECUTABLE_RELATIVE_PATH);
  let executableStat;
  try {
    executableStat = await lstat(executablePath);
  } catch {
    throw new Error(`Packaged Code executable is missing at ${executablePath}`);
  }
  if (executableStat.isSymbolicLink() || !executableStat.isFile()) {
    throw new Error(`Packaged Code executable must be a regular non-symbolic file`);
  }
  if (process.platform !== 'win32' && (executableStat.mode & 0o111) === 0) {
    throw new Error(`Packaged Code executable is not executable at ${executablePath}`);
  }
  const executableRealPath = await realpath(executablePath);
  if (!isPathInside(root, executableRealPath)) {
    throw new Error('Packaged Code executable escapes the source repository');
  }
  if (verifyDistribution && process.platform === 'darwin') {
    const applicationPath = resolve(executableRealPath, '..', '..', '..');
    runText(
      '/usr/bin/codesign',
      ['--verify', '--deep', '--strict', '--verbose=2', applicationPath],
      root,
    );
    try {
      runText(
        '/usr/sbin/spctl',
        ['--assess', '--type', 'execute', '--verbose=2', applicationPath],
        root,
      );
    } catch (error) {
      throw new Error(
        `Packaged Code is not Gatekeeper-approved. Supply Developer ID signing and notarization credentials. ${error.message}`,
      );
    }
  }
  return executableRealPath;
}

export function smokeChildEnvironment(environment = process.env) {
  const childEnvironment = {};
  for (const key of SMOKE_CHILD_ENVIRONMENT_KEYS) {
    const value = environment[key];
    if (typeof value === 'string' && value.length > 0) childEnvironment[key] = value;
  }
  for (const requiredKey of ['HOME', 'PATH']) {
    if (!childEnvironment[requiredKey]) {
      throw new Error(`${requiredKey} is required for the packaged Code smoke process`);
    }
  }
  return childEnvironment;
}

export function nativeSmokeCommand(executable, args) {
  if (!isAbsolute(executable)) {
    throw new Error('Packaged Code executable path must be absolute');
  }
  return [executable, '--mvp-smoke', ...args];
}

export async function loadConfig() {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const errors = [];
  assertObject(config, 'config', errors, [
    'schemaVersion',
    'verifierImageReference',
    'maximumReportAgeDays',
    'scenarioTimeoutSeconds',
    'cleanupTimeoutSeconds',
    'requiredScenarios',
  ]);
  if (config.schemaVersion !== 1) errors.push('config.schemaVersion must be 1');
  if (!isSafeImageReference(config.verifierImageReference)) {
    errors.push('config.verifierImageReference is invalid');
  }
  for (const key of ['maximumReportAgeDays', 'scenarioTimeoutSeconds', 'cleanupTimeoutSeconds']) {
    if (!Number.isInteger(config[key]) || config[key] <= 0) {
      errors.push(`config.${key} must be a positive integer`);
    }
  }
  if (!Array.isArray(config.requiredScenarios) || config.requiredScenarios.length === 0) {
    errors.push('config.requiredScenarios must be a non-empty array');
  } else {
    const ids = new Set();
    for (const [index, scenario] of config.requiredScenarios.entries()) {
      const path = `config.requiredScenarios[${index}]`;
      assertObject(
        scenario,
        path,
        errors,
        ['id', 'terminalStates', 'requiredChecks', 'acceptedChecks', 'requiredArtifactKinds'],
        ['id', 'terminalStates', 'requiredChecks', 'requiredArtifactKinds'],
      );
      if (!SAFE_ID_PATTERN.test(scenario.id ?? '')) errors.push(`${path}.id is invalid`);
      if (ids.has(scenario.id)) errors.push(`${path}.id is duplicated`);
      ids.add(scenario.id);
      assertStringArray(scenario.terminalStates, `${path}.terminalStates`, errors);
      assertStringArray(scenario.requiredChecks, `${path}.requiredChecks`, errors);
      assertStringArray(scenario.acceptedChecks ?? [], `${path}.acceptedChecks`, errors);
      assertStringArray(scenario.requiredArtifactKinds, `${path}.requiredArtifactKinds`, errors);
      for (const state of arrayOrEmpty(scenario.terminalStates)) {
        if (!['accepted', 'discarded'].includes(state)) {
          errors.push(`${path}.terminalStates contains ${state}`);
        }
      }
      for (const check of [
        ...arrayOrEmpty(scenario.requiredChecks),
        ...arrayOrEmpty(scenario.acceptedChecks),
      ]) {
        if (!ALLOWED_CHECKS.has(check)) errors.push(`${path} contains unknown check ${check}`);
      }
      for (const kind of arrayOrEmpty(scenario.requiredArtifactKinds)) {
        if (!ALLOWED_ARTIFACT_KINDS.has(kind)) {
          errors.push(`${path}.requiredArtifactKinds contains ${kind}`);
        }
      }
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return config;
}

export function defaultReportDirectory(environment = process.env) {
  if (environment.CODE_MVP_SMOKE_REPORT_DIR) {
    return resolve(environment.CODE_MVP_SMOKE_REPORT_DIR);
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Code', 'mvp-smoke');
  }
  const dataHome = environment.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(dataHome, 'code', 'mvp-smoke');
}

export async function canonicalizeOutputPath(path) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  return join(await realpath(dirname(absolute)), basename(absolute));
}

export function reportPathFor(reportDirectory) {
  return join(reportDirectory, REPORT_FILE);
}

export function runText(command, args, cwd) {
  const result = Bun.spawnSync({
    cmd: [command, ...args],
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    const detail = result.stderr.toString().trim();
    throw new Error(`${command} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout.toString().trim();
}

export function resolveCommitSha(repositoryRoot) {
  const commitSha = runText('git', ['rev-parse', 'HEAD'], repositoryRoot);
  if (!COMMIT_PATTERN.test(commitSha)) throw new Error('Git returned an invalid commit SHA');
  return commitSha;
}

export function readSourceState(repositoryRoot) {
  return runText(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    repositoryRoot,
  );
}

export function resolveVerifierImageId(reference, repositoryRoot) {
  const imageId = runText(
    'docker',
    ['image', 'inspect', '--format={{.Id}}', reference],
    repositoryRoot,
  );
  if (!IMAGE_ID_PATTERN.test(imageId)) {
    throw new Error(`Docker returned an invalid image ID for ${reference}`);
  }
  return imageId;
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

export async function writeReportWithChecksum(reportDirectory, report) {
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(join(reportDirectory, REPORT_FILE), reportText, { mode: 0o600 });
  await writeFile(
    join(reportDirectory, REPORT_CHECKSUM_FILE),
    `${sha256Text(reportText)}  ${REPORT_FILE}\n`,
    { mode: 0o600 },
  );
}

export async function readReportWithChecksum(reportDirectory) {
  const reportPath = join(reportDirectory, REPORT_FILE);
  const reportText = await readFile(reportPath, 'utf8');
  const checksumText = await readFile(join(reportDirectory, REPORT_CHECKSUM_FILE), 'utf8');
  const checksumMatch = checksumText.match(/^([0-9a-f]{64})  report\.json\n?$/);
  if (!checksumMatch) throw new Error(`${REPORT_CHECKSUM_FILE} has an invalid format`);
  if (checksumMatch[1] !== sha256Text(reportText)) {
    throw new Error(`${REPORT_CHECKSUM_FILE} does not match ${REPORT_FILE}`);
  }
  return JSON.parse(reportText);
}

export async function validateSmokeReport(
  report,
  { config, expectedCommitSha, expectedImageId, now = new Date(), reportDirectory },
) {
  const errors = [];
  validateReportShape(report, errors);

  if (report?.schemaVersion !== config.schemaVersion) {
    errors.push(`schemaVersion must be ${config.schemaVersion}`);
  }
  if (report?.producer !== 'code-mvp-smoke-runner/1') {
    errors.push('producer must be code-mvp-smoke-runner/1');
  }
  if (report?.commitSha !== expectedCommitSha) {
    errors.push(`commitSha must match Git HEAD ${expectedCommitSha}`);
  }
  if (report?.verifierImage?.reference !== config.verifierImageReference) {
    errors.push(`verifierImage.reference must be ${config.verifierImageReference}`);
  }
  if (report?.verifierImage?.id !== expectedImageId) {
    errors.push(`verifierImage.id must match ${expectedImageId}`);
  }

  validateTimestamps(report, config, now, errors);
  validateScenarios(report, config, errors);
  await validateArtifacts(report, reportDirectory, errors);
  validateCleanup(report, errors);

  return { valid: errors.length === 0, errors };
}

export function validateNativeScenarioResult(result, expectedScenario) {
  const errors = [];
  assertObject(result, 'native result', errors, [
    'id',
    'status',
    'terminalState',
    'verifiedDigest',
    'acceptedDigest',
    'checks',
    'artifacts',
  ]);
  if (result?.id !== expectedScenario.id) {
    errors.push(`native result id must be ${expectedScenario.id}`);
  }
  if (result?.status !== 'passed') errors.push('native result status must be passed');
  if (!expectedScenario.terminalStates.includes(result?.terminalState)) {
    errors.push(
      `native result terminalState must be one of ${expectedScenario.terminalStates.join(', ')}`,
    );
  }
  validateDigestPair(result, 'native result', errors);
  const requiredChecks = requiredChecksFor(expectedScenario, result?.terminalState);
  validateExactStringSet(result?.checks, requiredChecks, 'native result checks', errors);
  if (!Array.isArray(result?.artifacts)) {
    errors.push('native result artifacts must be an array');
  } else {
    if (result.artifacts.length > MAX_ARTIFACT_COUNT) {
      errors.push(`native result artifacts must contain at most ${MAX_ARTIFACT_COUNT} entries`);
    }
    for (const [index, artifact] of result.artifacts.entries()) {
      const path = `native result artifacts[${index}]`;
      assertObject(artifact, path, errors, ['kind', 'file']);
      if (!ALLOWED_ARTIFACT_KINDS.has(artifact?.kind)) {
        errors.push(`${path}.kind is invalid`);
      }
      if (
        typeof artifact?.file !== 'string' ||
        artifact.file.length === 0 ||
        isAbsolute(artifact.file) ||
        artifact.file.split(/[\\/]/).includes('..')
      ) {
        errors.push(`${path}.file must be a safe relative path`);
      }
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return result;
}

export function validateNativeCleanupResult(result) {
  const errors = [];
  assertObject(result, 'cleanup result', errors, ['status', 'remaining']);
  if (result?.status !== 'passed') errors.push('cleanup result status must be passed');
  validateRemaining(result?.remaining, 'cleanup result remaining', errors);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return result;
}

export async function collectNativeArtifacts({
  nativeArtifacts,
  nativeArtifactDirectory,
  reportArtifactDirectory,
  scenarioId,
  startingIndex,
}) {
  const artifacts = [];
  await mkdir(reportArtifactDirectory, { recursive: true });
  const root = await realpath(nativeArtifactDirectory);

  for (const [offset, artifact] of nativeArtifacts.entries()) {
    const source = resolve(nativeArtifactDirectory, artifact.file);
    const sourceLinkStat = await lstat(source);
    if (sourceLinkStat.isSymbolicLink()) {
      throw new Error(`Native artifact ${offset + 1} must not be a symbolic link`);
    }
    const sourceRealPath = await realpath(source);
    if (!isPathInside(root, sourceRealPath)) {
      throw new Error(`Native artifact ${offset + 1} escapes its artifact directory`);
    }
    const sourceStat = await lstat(sourceRealPath);
    if (!sourceStat.isFile()) {
      throw new Error(`Native artifact ${offset + 1} is not a regular file`);
    }
    if (sourceStat.size > MAX_ARTIFACT_SIZE_BYTES) {
      throw new Error(
        `Native artifact ${offset + 1} exceeds ${MAX_ARTIFACT_SIZE_BYTES} bytes`,
      );
    }
    const id = `${scenarioId}-${String(startingIndex + offset + 1).padStart(2, '0')}`;
    const relativePath = `artifacts/${id}.bin`;
    const destination = join(reportArtifactDirectory, `${id}.bin`);
    await copyFile(sourceRealPath, destination);
    const destinationStat = await stat(destination);
    artifacts.push({
      id,
      kind: artifact.kind,
      relativePath,
      sha256: await sha256File(destination),
      sizeBytes: destinationStat.size,
    });
  }
  return artifacts;
}

export async function promoteReportDirectory(temporaryDirectory, reportDirectory) {
  const repositoryRoot = runText('git', ['rev-parse', '--show-toplevel'], process.cwd());
  if (
    isPathInside(repositoryRoot, reportDirectory) ||
    isPathInside(reportDirectory, repositoryRoot)
  ) {
    throw new Error('Smoke reports must use a dedicated directory outside the source repository');
  }

  const parent = dirname(reportDirectory);
  const backup = join(parent, `.${basename(reportDirectory)}.previous-${process.pid}`);
  await mkdir(parent, { recursive: true });

  if (await pathExists(reportDirectory)) {
    const marker = join(reportDirectory, REPORT_DIRECTORY_MARKER);
    const markerContents = await readFile(marker, 'utf8').catch(() => null);
    if (markerContents !== '1\n') {
      throw new Error(
        `Refusing to replace ${reportDirectory}: it is not a managed smoke report directory`,
      );
    }
    await rm(backup, { recursive: true, force: true });
    await rename(reportDirectory, backup);
  }

  try {
    await rename(temporaryDirectory, reportDirectory);
    await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (await pathExists(backup)) await rename(backup, reportDirectory);
    throw error;
  }
}

export async function markManagedReportDirectory(reportDirectory) {
  await writeFile(join(reportDirectory, REPORT_DIRECTORY_MARKER), '1\n', { mode: 0o600 });
}

export function isPathInside(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function validateReportShape(report, errors) {
  assertObject(report, 'report', errors, [
    'schemaVersion',
    'producer',
    'commitSha',
    'verifierImage',
    'startedAt',
    'completedAt',
    'privacy',
    'source',
    'scenarios',
    'artifacts',
    'cleanup',
  ]);
  if (!COMMIT_PATTERN.test(report?.commitSha ?? '')) {
    errors.push('commitSha must be a full hexadecimal Git SHA');
  }
  assertObject(report?.verifierImage, 'verifierImage', errors, ['reference', 'id']);
  if (!isSafeImageReference(report?.verifierImage?.reference)) {
    errors.push('verifierImage.reference is invalid');
  }
  if (!IMAGE_ID_PATTERN.test(report?.verifierImage?.id ?? '')) {
    errors.push('verifierImage.id must be a sha256 Docker image ID');
  }
  assertObject(report?.privacy, 'privacy', errors, [
    'promptsIncluded',
    'repositoryContentsIncluded',
    'credentialsIncluded',
    'secretValuesIncluded',
  ]);
  for (const key of [
    'promptsIncluded',
    'repositoryContentsIncluded',
    'credentialsIncluded',
    'secretValuesIncluded',
  ]) {
    if (report?.privacy?.[key] !== false) errors.push(`privacy.${key} must be false`);
  }
  assertObject(report?.source, 'source', errors, ['cleanAtStart', 'unchanged']);
  if (report?.source?.cleanAtStart !== true) errors.push('source.cleanAtStart must be true');
  if (report?.source?.unchanged !== true) errors.push('source.unchanged must be true');
  if (!Array.isArray(report?.scenarios)) errors.push('scenarios must be an array');
  if (!Array.isArray(report?.artifacts)) errors.push('artifacts must be an array');
}

function validateTimestamps(report, config, now, errors) {
  const startedAt = parseCanonicalDate(report?.startedAt);
  const completedAt = parseCanonicalDate(report?.completedAt);
  if (!Number.isFinite(startedAt)) errors.push('startedAt must be an ISO date-time');
  if (!Number.isFinite(completedAt)) errors.push('completedAt must be an ISO date-time');
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) return;
  if (startedAt > completedAt) errors.push('startedAt must not be after completedAt');
  if (completedAt > now.getTime() + 5 * 60 * 1000) {
    errors.push('completedAt must not be more than five minutes in the future');
  }
  const maximumAgeMs = config.maximumReportAgeDays * 24 * 60 * 60 * 1000;
  if (now.getTime() - completedAt > maximumAgeMs) {
    errors.push(`report is older than ${config.maximumReportAgeDays} days`);
  }
}

function validateScenarios(report, config, errors) {
  if (!Array.isArray(report?.scenarios)) return;
  if (report.scenarios.length !== config.requiredScenarios.length) {
    errors.push(`scenarios must contain exactly ${config.requiredScenarios.length} entries`);
  }
  const byId = new Map();
  for (const [index, scenario] of report.scenarios.entries()) {
    const path = `scenarios[${index}]`;
    assertObject(scenario, path, errors, [
      'id',
      'status',
      'durationMs',
      'terminalState',
      'verifiedDigest',
      'acceptedDigest',
      'checks',
      'artifactIds',
    ]);
    if (!SAFE_ID_PATTERN.test(scenario?.id ?? '')) errors.push(`${path}.id is invalid`);
    if (byId.has(scenario?.id)) errors.push(`${path}.id is duplicated`);
    byId.set(scenario?.id, scenario);
    if (scenario?.status !== 'passed') errors.push(`${path}.status must be passed`);
    if (!Number.isInteger(scenario?.durationMs) || scenario.durationMs < 0) {
      errors.push(`${path}.durationMs must be a non-negative integer`);
    }
    validateDigestPair(scenario, path, errors);
    const checks = arrayOrEmpty(scenario?.checks);
    assertStringArray(scenario?.checks, `${path}.checks`, errors);
    for (const check of checks) {
      if (!ALLOWED_CHECKS.has(check)) errors.push(`${path}.checks contains ${check}`);
    }
    const artifactIds = arrayOrEmpty(scenario?.artifactIds);
    assertStringArray(scenario?.artifactIds, `${path}.artifactIds`, errors);
    for (const id of artifactIds) {
      if (!SAFE_ID_PATTERN.test(id)) errors.push(`${path}.artifactIds contains an invalid ID`);
    }
  }

  const artifactsById = new Map(
    Array.isArray(report.artifacts)
      ? report.artifacts.map((artifact) => [artifact?.id, artifact])
      : [],
  );
  for (const required of config.requiredScenarios) {
    const scenario = byId.get(required.id);
    if (!scenario) {
      errors.push(`required scenario ${required.id} is missing`);
      continue;
    }
    if (!required.terminalStates.includes(scenario.terminalState)) {
      errors.push(
        `${required.id}.terminalState must be one of ${required.terminalStates.join(', ')}`,
      );
    }
    validateExactStringSet(
      scenario.checks,
      requiredChecksFor(required, scenario.terminalState),
      `${required.id}.checks`,
      errors,
    );
    const artifactKinds = new Set(
      arrayOrEmpty(scenario.artifactIds)
        .map((id) => artifactsById.get(id)?.kind)
        .filter(Boolean),
    );
    for (const kind of required.requiredArtifactKinds) {
      if (!artifactKinds.has(kind)) {
        errors.push(`${required.id} must reference a ${kind} artifact`);
      }
    }
  }
}

async function validateArtifacts(report, reportDirectory, errors) {
  if (!Array.isArray(report?.artifacts)) return;
  if (report.artifacts.length > MAX_ARTIFACT_COUNT) {
    errors.push(`artifacts must contain at most ${MAX_ARTIFACT_COUNT} entries`);
  }
  const ids = new Set();
  let totalSizeBytes = 0;
  const reportRealPath = reportDirectory ? await realpath(reportDirectory).catch(() => null) : null;
  const referencedIds = new Set(
    Array.isArray(report.scenarios)
      ? report.scenarios
          .flatMap((scenario) => arrayOrEmpty(scenario?.artifactIds))
          .filter((id) => typeof id === 'string')
      : [],
  );
  for (const [index, artifact] of report.artifacts.entries()) {
    const path = `artifacts[${index}]`;
    assertObject(artifact, path, errors, ['id', 'kind', 'relativePath', 'sha256', 'sizeBytes']);
    if (!SAFE_ID_PATTERN.test(artifact?.id ?? '')) errors.push(`${path}.id is invalid`);
    if (ids.has(artifact?.id)) errors.push(`${path}.id is duplicated`);
    ids.add(artifact?.id);
    if (!ALLOWED_ARTIFACT_KINDS.has(artifact?.kind)) errors.push(`${path}.kind is invalid`);
    if (artifact?.relativePath !== `artifacts/${artifact?.id}.bin`) {
      errors.push(`${path}.relativePath must use its canonical artifact path`);
    }
    if (!SHA256_PATTERN.test(artifact?.sha256 ?? '')) errors.push(`${path}.sha256 is invalid`);
    if (!Number.isInteger(artifact?.sizeBytes) || artifact.sizeBytes < 0) {
      errors.push(`${path}.sizeBytes must be a non-negative integer`);
    } else {
      totalSizeBytes += artifact.sizeBytes;
      if (artifact.sizeBytes > MAX_ARTIFACT_SIZE_BYTES) {
        errors.push(`${path}.sizeBytes exceeds ${MAX_ARTIFACT_SIZE_BYTES} bytes`);
      }
    }
    if (!referencedIds.has(artifact?.id)) errors.push(`${path} is not referenced by a scenario`);

    if (
      reportDirectory &&
      typeof artifact?.relativePath === 'string' &&
      artifact.relativePath === `artifacts/${artifact?.id}.bin`
    ) {
      try {
        const artifactPath = resolve(reportDirectory, artifact.relativePath);
        if (!isPathInside(reportDirectory, artifactPath)) {
          errors.push(`${path}.relativePath escapes the report directory`);
          continue;
        }
        const artifactRealPath = await realpath(artifactPath);
        if (!reportRealPath || !isPathInside(reportRealPath, artifactRealPath)) {
          errors.push(`${path}.relativePath escapes the real report directory`);
          continue;
        }
        const artifactStat = await lstat(artifactPath);
        if (artifactStat.isSymbolicLink()) {
          errors.push(`${path} must not point to a symbolic link`);
          continue;
        }
        if (!artifactStat.isFile()) {
          errors.push(`${path} does not point to a regular file`);
          continue;
        }
        if (artifactStat.size !== artifact.sizeBytes) {
          errors.push(`${path}.sizeBytes does not match the artifact`);
        }
        if ((await sha256File(artifactPath)) !== artifact.sha256) {
          errors.push(`${path}.sha256 does not match the artifact`);
        }
      } catch {
        errors.push(`${path} artifact file is missing`);
      }
    }
  }
  for (const id of referencedIds) {
    if (!ids.has(id)) errors.push(`scenario artifact ${String(id)} is missing`);
  }
  if (totalSizeBytes > MAX_TOTAL_ARTIFACT_SIZE_BYTES) {
    errors.push(`artifacts exceed ${MAX_TOTAL_ARTIFACT_SIZE_BYTES} total bytes`);
  }
}

function validateCleanup(report, errors) {
  assertObject(report?.cleanup, 'cleanup', errors, ['status', 'durationMs', 'remaining']);
  if (report?.cleanup?.status !== 'passed') errors.push('cleanup.status must be passed');
  if (!Number.isInteger(report?.cleanup?.durationMs) || report.cleanup.durationMs < 0) {
    errors.push('cleanup.durationMs must be a non-negative integer');
  }
  validateRemaining(report?.cleanup?.remaining, 'cleanup.remaining', errors);
}

function validateRemaining(remaining, path, errors) {
  assertObject(remaining, path, errors, [
    'worktrees',
    'childProcesses',
    'labeledContainers',
    'temporaryBranches',
  ]);
  for (const key of ['worktrees', 'childProcesses', 'labeledContainers', 'temporaryBranches']) {
    if (remaining?.[key] !== 0) errors.push(`${path}.${key} must be 0`);
  }
}

function validateDigestPair(value, path, errors) {
  const verified = value?.verifiedDigest;
  const accepted = value?.acceptedDigest;
  if (value?.terminalState === 'accepted') {
    if (!SHA256_PATTERN.test(verified ?? '')) {
      errors.push(`${path}.verifiedDigest must be a SHA-256 digest when accepted`);
    }
    if (!SHA256_PATTERN.test(accepted ?? '')) {
      errors.push(`${path}.acceptedDigest must be a SHA-256 digest when accepted`);
    }
    if (verified !== accepted) {
      errors.push(`${path}.acceptedDigest must match verifiedDigest`);
    }
  } else if (value?.terminalState === 'discarded') {
    if (verified !== null) errors.push(`${path}.verifiedDigest must be null when discarded`);
    if (accepted !== null) errors.push(`${path}.acceptedDigest must be null when discarded`);
  }
}

function requiredChecksFor(scenario, terminalState) {
  return [
    ...arrayOrEmpty(scenario.requiredChecks),
    ...(terminalState === 'accepted' ? arrayOrEmpty(scenario.acceptedChecks) : []),
  ];
}

function validateExactStringSet(actual, expected, path, errors) {
  if (!Array.isArray(actual)) {
    errors.push(`${path} must be an array`);
    return;
  }
  const actualSet = new Set(actual);
  if (actualSet.size !== actual.length) errors.push(`${path} must not contain duplicates`);
  const missing = expected.filter((value) => !actualSet.has(value));
  const extra = actual.filter((value) => !expected.includes(value));
  if (missing.length > 0) errors.push(`${path} is missing: ${missing.join(', ')}`);
  if (extra.length > 0) errors.push(`${path} contains unexpected values: ${extra.join(', ')}`);
}

function assertObject(value, path, errors, allowedKeys, requiredKeys = allowedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} is required`);
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) errors.push(`${path}.${key} is not allowed`);
  }
}

function assertStringArray(value, path, errors) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    errors.push(`${path} must be an array of strings`);
  }
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function parseCanonicalDate(value) {
  if (typeof value !== 'string') return Number.NaN;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return Number.NaN;
  return new Date(timestamp).toISOString() === value ? timestamp : Number.NaN;
}

function isSafeImageReference(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._/:@-]{0,127}$/.test(value);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
