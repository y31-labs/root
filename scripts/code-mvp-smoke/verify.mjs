#!/usr/bin/env bun

import {
  defaultReportDirectory,
  loadConfig,
  readReportWithChecksum,
  readSourceState,
  resolveCommitSha,
  resolveVerifierImageId,
  validateSmokeReport,
} from './lib.mjs';

const repositoryRoot = process.cwd();
const reportDirectory = defaultReportDirectory();

try {
  const config = await loadConfig();
  const expectedCommitSha = resolveCommitSha(repositoryRoot);
  if (readSourceState(repositoryRoot) !== '') {
    throw new Error('the declaration repository must be clean and match Git HEAD exactly');
  }
  const expectedImageId = resolveVerifierImageId(config.verifierImageReference, repositoryRoot);
  const report = await readReportWithChecksum(reportDirectory);
  const result = await validateSmokeReport(report, {
    config,
    expectedCommitSha,
    expectedImageId,
    reportDirectory,
  });

  if (!result.valid) {
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Valid MVP smoke report for ${expectedCommitSha} and ${expectedImageId}.`);
  }
} catch (error) {
  console.error(`Smoke report verification failed: ${error.message}`);
  process.exitCode = 1;
}
