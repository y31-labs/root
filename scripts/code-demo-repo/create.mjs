#!/usr/bin/env bun

import { mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const defaultOutput = join(process.env.HOME ?? process.cwd(), 'Code', 'code-private-beta-demo');
const options = parseArgs(process.argv.slice(2));
const output = resolve(options.output ?? defaultOutput);

if (options.help) {
  console.log(`Usage: bun run code:demo:create [--output <path>] [--force]

Creates a standalone Bun TypeScript demo repository for Code private-beta pilots.
Default output: ${defaultOutput}`);
  process.exit(0);
}

if (isPathInside(repositoryRoot, output) || repositoryRoot === output) {
  throw new Error('Choose an output path outside this monorepo.');
}

if (await exists(output)) {
  if (!options.force) {
    throw new Error(`Output already exists: ${output}. Pass --force to replace it.`);
  }
  await rm(output, { recursive: true, force: true });
}

await mkdir(join(output, 'packages', 'fixture'), { recursive: true });
await mkdir(join(output, 'src'), { recursive: true });
await writeFile(
  join(output, 'package.json'),
  `${JSON.stringify(
    {
      name: 'code-private-beta-demo',
      private: true,
      type: 'module',
      dependencies: {
        '@code-demo/fixture': 'file:packages/fixture',
      },
      scripts: {
        test: 'bun test',
        'test:unit': 'bun test',
      },
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  join(output, 'packages', 'fixture', 'package.json'),
  `${JSON.stringify(
    {
      name: '@code-demo/fixture',
      version: '0.0.0',
      private: true,
      type: 'module',
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  join(output, 'README.md'),
  `# Code Private Beta Demo

This is a small Bun TypeScript repository for the Code local verified-branch loop.

## Pilot Task

Ask Code:

> Fix \`checkoutTotalCents\` so it respects item quantity, and keep the unit tests passing.

Expected verification:

\`\`\`sh
bun run test:unit
\`\`\`
`,
);
await writeFile(
  join(output, 'src', 'cart.ts'),
  `export interface CartItem {
  sku: string;
  unitPriceCents: number;
  quantity: number;
}

export const checkoutTotalCents = (items: CartItem[]) =>
  items.reduce((total, item) => total + item.unitPriceCents, 0);
`,
);
await writeFile(
  join(output, 'src', 'cart.test.ts'),
  `import { describe, expect, test } from 'bun:test';

import { checkoutTotalCents } from './cart';

describe('checkoutTotalCents', () => {
  test('sums unit price by quantity for every cart item', () => {
    expect(
      checkoutTotalCents([
        { sku: 'coffee', unitPriceCents: 1299, quantity: 2 },
        { sku: 'filter', unitPriceCents: 250, quantity: 1 },
      ]),
    ).toBe(2848);
  });
});
`,
);

await run('bun', ['install'], output);
await run('git', ['init'], output);
await run('git', ['add', '.'], output);
await run(
  'git',
  [
    '-c',
    'user.name=Code Demo',
    '-c',
    'user.email=code-demo@localhost',
    'commit',
    '-m',
    'Create Code private beta demo',
  ],
  output,
);

const canonicalOutput = await realpath(output);
console.log(`Created demo repository at ${canonicalOutput}`);
console.log('Pilot task: Fix checkoutTotalCents so it respects item quantity.');

function parseArgs(args) {
  const parsed = { force: false, help: false, output: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--force') {
      parsed.force = true;
    } else if (arg === '--help') {
      parsed.help = true;
    } else if (arg === '--output') {
      const value = args[index + 1];
      if (!value) throw new Error('--output requires a path');
      parsed.output = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function isPathInside(parent, child) {
  const relative = resolve(child).slice(resolve(parent).length);
  return relative.startsWith('/') && !relative.startsWith('/..');
}

async function run(command, args, cwd) {
  const child = Bun.spawn([command, ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${stdout}${stderr}`);
  }
}
