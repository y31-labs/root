import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  generatedInterfaceJsonSchema,
  generatedInterfaceSchema,
  type GeneratedInterface,
  type InterfaceRequest,
} from '#/lib/interface-contract';
import { interfaceGeneratorToolName } from '#/server/interface-tool';

const CODEX_TIMEOUT_MS = 35_000;

const codexPrompt = ({ brief }: InterfaceRequest) => `You are ${interfaceGeneratorToolName}.

Return only valid JSON matching the provided output schema.

Build a minimal generated interface contract for this user problem:
${brief}

Rules:
- Do not make a chat transcript.
- Design the interface around the user's actual job to be done.
- Prefer a travel booking surface when the brief involves tickets, trips, flights, trains, hotels, or destinations.
- Include Vercel Sandbox as the display target with provider "vercel-sandbox", runtime "node24", port 3000, command "bun run interface-lab:dev", and previewPath "/".
- Keep text concise and practical.`;

const parseCodexOutput = (raw: string) => {
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) throw new Error('Codex did not return JSON.');
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  }
};

const runCodex = async (request: InterfaceRequest, outputSchemaPath: string, outputPath: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(
      'codex',
      [
        'exec',
        '--ephemeral',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--color',
        'never',
        '--output-schema',
        outputSchemaPath,
        '--output-last-message',
        outputPath,
        '-',
      ],
      { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] },
    );

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Codex generation timed out.'));
    }, CODEX_TIMEOUT_MS);

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `Codex exited with code ${code ?? 'unknown'}.`));
    });

    child.stdin.end(codexPrompt(request));
  });

export const runCodexInterfaceGenerator = async (
  request: InterfaceRequest,
): Promise<GeneratedInterface> => {
  const dir = join(tmpdir(), `interface-lab-${crypto.randomUUID()}`);
  const outputSchemaPath = join(dir, 'interface.schema.json');
  const outputPath = join(dir, 'interface.json');

  await mkdir(dir, { recursive: true });

  try {
    await writeFile(outputSchemaPath, JSON.stringify(generatedInterfaceJsonSchema, null, 2));
    await runCodex(request, outputSchemaPath, outputPath);

    const raw = await readFile(outputPath, 'utf8');
    const parsed = generatedInterfaceSchema.parse(parseCodexOutput(raw));

    return {
      ...parsed,
      backend: {
        kind: 'codex',
        detail: 'Codex generated this interface contract with a strict output schema.',
      },
      sandbox: {
        provider: 'vercel-sandbox',
        runtime: 'node24',
        port: 3000,
        command: 'bun run interface-lab:dev',
        previewPath: '/',
      },
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
