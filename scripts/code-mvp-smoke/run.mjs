#!/usr/bin/env bun

import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
  collectNativeArtifacts,
  canonicalizeOutputPath,
  defaultReportDirectory,
  isPathInside,
  loadConfig,
  markManagedReportDirectory,
  nativeSmokeCommand,
  promoteReportDirectory,
  readSourceState,
  resolveCommitSha,
  resolvePackagedCodeExecutable,
  resolveVerifierImageId,
  sha256File,
  smokeChildEnvironment,
  validateNativeCleanupResult,
  validateNativeScenarioResult,
  validateSmokeReport,
  writeReportWithChecksum,
} from './lib.mjs';

if (process.argv.includes('--help')) {
  console.log(`Usage: bun run code:mvp:smoke

Runs the packaged Code executable through its narrow --mvp-smoke protocol.
The runner never invokes a shell and stores its metadata-only report outside the repository.
See .docs/code-mvp-smoke.md for prerequisites and protocol details.`);
  process.exit(0);
}

const repositoryRoot = await realpath(process.cwd());
const reportDirectory = await canonicalizeOutputPath(defaultReportDirectory());
if (
  isPathInside(repositoryRoot, reportDirectory) ||
  isPathInside(reportDirectory, repositoryRoot)
) {
  console.error(
    'CODE_MVP_SMOKE_REPORT_DIR must be a dedicated directory outside the source repository.',
  );
  process.exit(1);
}
const temporaryDirectory = await mkdtemp(
  join(dirname(reportDirectory), `.${basename(reportDirectory)}.run-`),
);
let finalDirectory = null;
let currentChild = null;
let interrupted = false;
let interruptTimer = null;
let codeExecutable;
let childEnvironment;

const interrupt = () => {
  interrupted = true;
  currentChild?.kill('SIGTERM');
  clearTimeout(interruptTimer);
  interruptTimer = setTimeout(() => currentChild?.kill('SIGKILL'), 5_000);
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);

try {
  const config = await loadConfig();
  codeExecutable = await resolvePackagedCodeExecutable(repositoryRoot);
  const codeExecutableSha = await sha256File(codeExecutable);
  childEnvironment = smokeChildEnvironment();
  const commitSha = resolveCommitSha(repositoryRoot);
  const sourceState = readSourceState(repositoryRoot);
  if (sourceState !== '') {
    throw new Error(
      'The declaration repository must be clean so the smoke run represents exactly Git HEAD',
    );
  }
  const verifierImageId = resolveVerifierImageId(config.verifierImageReference, repositoryRoot);
  const startedAt = new Date().toISOString();
  const scenarios = [];
  const artifacts = [];
  let cleanup = null;
  let runError = null;

  await mkdir(join(temporaryDirectory, 'native-results'), { recursive: true });
  await mkdir(join(temporaryDirectory, 'native-artifacts'), { recursive: true });
  await mkdir(join(temporaryDirectory, 'artifacts'), { recursive: true });

  try {
    for (const scenario of config.requiredScenarios) {
      if (interrupted) throw new Error('Smoke run interrupted');
      const resultPath = join(temporaryDirectory, 'native-results', `${scenario.id}.json`);
      const nativeArtifactDirectory = join(temporaryDirectory, 'native-artifacts', scenario.id);
      await mkdir(nativeArtifactDirectory, { recursive: true });
      const scenarioStartedAt = performance.now();
      await runNativeSmoke(
        [
          '--protocol',
          '1',
          '--scenario',
          scenario.id,
          '--output',
          resultPath,
          '--artifact-directory',
          nativeArtifactDirectory,
          '--repository-root',
          repositoryRoot,
          '--commit',
          commitSha,
          '--verifier-image-reference',
          config.verifierImageReference,
          '--verifier-image-id',
          verifierImageId,
        ],
        config.scenarioTimeoutSeconds,
      );
      const nativeResult = validateNativeScenarioResult(
        await readNativeResult(resultPath),
        scenario,
      );
      const scenarioArtifacts = await collectNativeArtifacts({
        nativeArtifacts: nativeResult.artifacts,
        nativeArtifactDirectory,
        reportArtifactDirectory: join(temporaryDirectory, 'artifacts'),
        scenarioId: scenario.id,
        startingIndex: artifacts.length,
      });
      artifacts.push(...scenarioArtifacts);
      scenarios.push({
        id: nativeResult.id,
        status: 'passed',
        durationMs: Math.round(performance.now() - scenarioStartedAt),
        terminalState: nativeResult.terminalState,
        verifiedDigest: nativeResult.verifiedDigest,
        acceptedDigest: nativeResult.acceptedDigest,
        checks: nativeResult.checks,
        artifactIds: scenarioArtifacts.map((artifact) => artifact.id),
      });
    }
  } catch (error) {
    runError = error;
  } finally {
    const cleanupResultPath = join(temporaryDirectory, 'native-results', 'cleanup.json');
    const cleanupStartedAt = performance.now();
    try {
      await runNativeSmoke(
        [
          '--protocol',
          '1',
          '--cleanup',
          '--output',
          cleanupResultPath,
          '--repository-root',
          repositoryRoot,
        ],
        config.cleanupTimeoutSeconds,
        true,
      );
      const nativeCleanup = validateNativeCleanupResult(await readNativeResult(cleanupResultPath));
      cleanup = {
        status: 'passed',
        durationMs: Math.round(performance.now() - cleanupStartedAt),
        remaining: nativeCleanup.remaining,
      };
    } catch (error) {
      runError = runError
        ? new Error(`${runError.message}; cleanup also failed: ${error.message}`)
        : error;
    }
  }

  const finalCommitSha = resolveCommitSha(repositoryRoot);
  const finalSourceState = readSourceState(repositoryRoot);
  const finalCodeExecutable = await resolvePackagedCodeExecutable(repositoryRoot);
  const finalVerifierImageId = resolveVerifierImageId(
    config.verifierImageReference,
    repositoryRoot,
  );
  if (
    finalCommitSha !== commitSha ||
    finalSourceState !== sourceState ||
    finalCodeExecutable !== codeExecutable ||
    (await sha256File(finalCodeExecutable)) !== codeExecutableSha ||
    finalVerifierImageId !== verifierImageId
  ) {
    runError = new Error('The smoke run changed the declaration repository');
  }
  if (runError) throw runError;

  const report = {
    schemaVersion: config.schemaVersion,
    producer: 'code-mvp-smoke-runner/1',
    commitSha,
    verifierImage: {
      reference: config.verifierImageReference,
      id: verifierImageId,
    },
    startedAt,
    completedAt: new Date().toISOString(),
    privacy: {
      promptsIncluded: false,
      repositoryContentsIncluded: false,
      credentialsIncluded: false,
      secretValuesIncluded: false,
    },
    source: {
      cleanAtStart: true,
      unchanged: true,
    },
    scenarios,
    artifacts,
    cleanup,
  };
  const validation = await validateSmokeReport(report, {
    config,
    expectedCommitSha: commitSha,
    expectedImageId: verifierImageId,
    reportDirectory: temporaryDirectory,
  });
  if (!validation.valid) {
    throw new Error(`Generated report is invalid:\n${validation.errors.join('\n')}`);
  }

  finalDirectory = await mkdtemp(
    join(dirname(reportDirectory), `.${basename(reportDirectory)}.final-`),
  );
  await mkdir(join(finalDirectory, 'artifacts'));
  for (const artifact of artifacts) {
    await copyFile(
      join(temporaryDirectory, artifact.relativePath),
      join(finalDirectory, artifact.relativePath),
    );
  }
  await writeReportWithChecksum(finalDirectory, report);
  await markManagedReportDirectory(finalDirectory);
  await rm(temporaryDirectory, { recursive: true, force: true });
  await promoteReportDirectory(finalDirectory, reportDirectory);
  finalDirectory = null;
  console.log(`MVP smoke report written to ${reportDirectory}`);
} catch (error) {
  await rm(temporaryDirectory, { recursive: true, force: true });
  if (finalDirectory) await rm(finalDirectory, { recursive: true, force: true });
  console.error(`MVP smoke run failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(interruptTimer);
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}

async function runNativeSmoke(args, timeoutSeconds, allowInterrupted = false) {
  currentChild = Bun.spawn({
    cmd: nativeSmokeCommand(codeExecutable, args),
    cwd: repositoryRoot,
    env: childEnvironment,
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  let forcedTimer;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    currentChild?.kill('SIGTERM');
    forcedTimer = setTimeout(() => currentChild?.kill('SIGKILL'), 5_000);
  }, timeoutSeconds * 1_000);
  const exitCode = await currentChild.exited;
  clearTimeout(timeout);
  clearTimeout(forcedTimer);
  currentChild = null;
  if (interrupted && !allowInterrupted) throw new Error('Smoke run interrupted');
  if (timedOut)
    throw new Error(`Packaged Code smoke process timed out after ${timeoutSeconds} seconds`);
  if (exitCode !== 0) throw new Error(`Packaged Code smoke process exited with status ${exitCode}`);
}

async function readNativeResult(path) {
  const resultStat = await stat(path);
  if (!resultStat.isFile() || resultStat.size > 64 * 1024) {
    throw new Error('Native smoke result must be a regular JSON file no larger than 64 KiB');
  }
  return JSON.parse(await readFile(path, 'utf8'));
}
