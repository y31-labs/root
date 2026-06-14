const image = 'code-agent-verifier:1';
const expected = {
  architecture: process.arch === 'arm64' ? 'arm64' : 'amd64',
  bun: '1.3.5',
  playwright: '1.55.0',
  browser: 'chromium',
  schema: '1',
  protocol: '1',
  fingerprint: 'sha256:46960e4bee087eeae3b22c38bb98d68565f2a91f5bf08bdadf3b26ebb3a58361',
};

try {
  const inspect = JSON.parse(run('docker', ['image', 'inspect', image]))[0];
  assertEqual('architecture', inspect.Architecture, expected.architecture);
  const labels = inspect.Config?.Labels ?? {};
  for (const [name, value] of Object.entries(expected)) {
    if (name === 'architecture') continue;
    assertEqual(name, labels[`dev.root.code.verifier.${name}`], value);
  }
  assertEqual(
    'architecture label',
    labels['dev.root.code.verifier.architecture'],
    expected.architecture,
  );

  const output = run('docker', [
    'run',
    '--rm',
    '--network',
    'none',
    image,
    'sh',
    '-lc',
    [
      'cat /opt/code-verifier/runtime-metadata.json',
      'bun --version',
      `node -p "require('playwright/package.json').version"`,
      `find /ms-playwright -path '*/chrome-linux/chrome' -type f -perm -111 -print -quit`,
    ].join('; '),
  ]).split('\n');
  const metadata = JSON.parse(output[0]);
  assertEqual('runtime architecture', metadata.architecture, expected.architecture);
  assertEqual('runtime Bun', metadata.bunVersion, expected.bun);
  assertEqual('runtime Playwright', metadata.playwrightVersion, expected.playwright);
  assertEqual('runtime browser', metadata.browser, expected.browser);
  assertEqual('runtime schema', metadata.schemaVersion, expected.schema);
  assertEqual('runtime protocol', metadata.protocolVersion, expected.protocol);
  assertEqual('runtime fingerprint', metadata.fingerprint, expected.fingerprint);
  assertEqual('Bun executable', output[1], expected.bun);
  assertEqual('Playwright package', output[2], expected.playwright);
  if (!output[3]?.includes('/chrome-linux/chrome')) {
    throw new Error('Chromium executable is missing from the verifier image');
  }

  console.log(
    JSON.stringify({
      image,
      imageId: inspect.Id,
      architecture: expected.architecture,
      bunVersion: expected.bun,
      playwrightVersion: expected.playwright,
      browser: expected.browser,
    }),
  );
} catch (error) {
  console.error(
    `Runtime verification failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

function assertEqual(label: string, actual: unknown, expectedValue: string) {
  if (actual !== expectedValue) {
    throw new Error(`${label} mismatch: expected ${expectedValue}, found ${String(actual)}`);
  }
}

function run(command: string, args: string[]) {
  const process = Bun.spawnSync([command, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = `${process.stdout.toString()}${process.stderr.toString()}`.trim();
  if (process.exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${output || 'No output'}`);
  }
  return output;
}
