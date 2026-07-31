import { resolve } from 'node:path';

const VERSION_UPDATES = ['keep', 'patch', 'minor', 'major'] as const;

type VersionUpdate = (typeof VERSION_UPDATES)[number];

export const updateVersion = (version: string, versionUpdate: VersionUpdate) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Austi version ${version} is not valid semantic versioning.`);
  if (versionUpdate === 'keep') return version;

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  if (versionUpdate === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (versionUpdate === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
};

const main = async () => {
  const update = Bun.argv[2] as VersionUpdate | undefined;
  if (!update || !VERSION_UPDATES.includes(update)) {
    throw new Error(`Version update must be one of: ${VERSION_UPDATES.join(', ')}.`);
  }

  const repositoryRoot = resolve(import.meta.dir, '../../..');
  const tauriConfigPath = resolve(repositoryRoot, 'apps/austi/src-tauri/tauri.conf.json');
  const cargoManifestPath = resolve(repositoryRoot, 'apps/austi/src-tauri/Cargo.toml');
  const cargoLockPath = resolve(repositoryRoot, 'apps/austi/src-tauri/Cargo.lock');

  const tauriConfigContents = await Bun.file(tauriConfigPath).text();
  const tauriConfig = JSON.parse(tauriConfigContents);
  const currentVersion = String(tauriConfig.version);
  const nextVersion = updateVersion(currentVersion, update);

  if (nextVersion !== currentVersion) {
    const cargoManifest = await Bun.file(cargoManifestPath).text();
    const cargoLock = await Bun.file(cargoLockPath).text();
    const tauriVersionPattern = /(\n  "version": ")[^"]+("[,\n])/;
    const packageVersionPattern = /(\[package\]\nname = "austi"\nversion = ")[^"]+("\n)/;
    const lockVersionPattern = /(\[\[package\]\]\nname = "austi"\nversion = ")[^"]+("\n)/;

    if (
      !tauriVersionPattern.test(tauriConfigContents) ||
      !packageVersionPattern.test(cargoManifest) ||
      !lockVersionPattern.test(cargoLock)
    ) {
      throw new Error('Could not find every Austi version field.');
    }

    await Promise.all([
      Bun.write(
        tauriConfigPath,
        tauriConfigContents.replace(tauriVersionPattern, `$1${nextVersion}$2`),
      ),
      Bun.write(
        cargoManifestPath,
        cargoManifest.replace(packageVersionPattern, `$1${nextVersion}$2`),
      ),
      Bun.write(cargoLockPath, cargoLock.replace(lockVersionPattern, `$1${nextVersion}$2`)),
    ]);
  }

  console.log(nextVersion);
};

if (import.meta.main) await main();
