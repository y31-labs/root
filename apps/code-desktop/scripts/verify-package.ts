import { existsSync } from 'node:fs';
import { join } from 'node:path';

try {
  const bundleRoot = join(import.meta.dir, '..', 'src-tauri', 'target', 'release', 'bundle');
  const config = await Bun.file(join(import.meta.dir, '..', 'src-tauri', 'tauri.conf.json')).json();
  const version = String(config.version);
  const app = join(bundleRoot, 'macos', 'Code.app');
  const executable = join(app, 'Contents', 'MacOS', 'code-desktop');
  const dmg = join(bundleRoot, 'dmg', `Code_${version}_aarch64.dmg`);

  for (const path of [app, executable, dmg]) {
    if (!existsSync(path)) throw new Error(`Missing packaged artifact: ${path}`);
  }

  const architecture = run('file', [executable]);
  if (!architecture.includes('Mach-O 64-bit executable arm64')) {
    throw new Error(`Packaged executable is not Apple Silicon arm64:\n${architecture}`);
  }

  run('codesign', ['--verify', '--deep', '--strict', app]);
  try {
    run('spctl', ['--assess', '--type', 'execute', app]);
  } catch (error) {
    throw new Error(
      `Gatekeeper rejected the app. Supply a Developer ID Application identity and notarization credentials.\n${error instanceof Error ? error.message : String(error)}`,
    );
  }

  console.log(JSON.stringify({ app, dmg, architecture: 'arm64', signed: true, notarized: true }));
} catch (error) {
  console.error(
    `Package verification failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
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
