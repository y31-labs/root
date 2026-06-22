#!/usr/bin/env bunimport { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import {
  defaultConfigForMissingDocument,
  digestFlowguardFlow,
  hasIssueErrors,
  parseFlowProposalJson,
  parseFlowguardConfigJson,
  parseFlowguardFlowJson,
  serializeCanonicalJson,
} from '../../../packages/flowguard-contracts/src/index.ts';

const serverInfo = {
  name: 'flowguard',
  version: '0.1.0',
};

const tools = [
  {
    name: 'flowguard_list_approved_flows',
    description: 'List approved Flowguard contracts in the current repository.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'flowguard_read_approved_flow',
    description: 'Read one approved Flowguard contract by flow id and return its current digest.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['flowId'],
      properties: {
        flowId: {
          type: 'string',
          description: 'Approved Flowguard contract id.',
        },
      },
    },
  },
  {
    name: 'flowguard_write_proposal',
    description:
      'Validate and write a Flowguard proposal file. Writes are confined to .flowguard/proposals/.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['proposal'],
      properties: {
        proposal: {
          type: 'object',
          description: 'Version 1 FlowProposal JSON object.',
        },
        overwrite: {
          type: 'boolean',
          description: 'Replace an existing proposal file with the same id.',
          default: false,
        },
      },
    },
  },
];

const repositoryRoot = resolve(process.env.FLOWGUARD_REPO_ROOT ?? process.cwd());

process.stdin.setEncoding('utf8');

let inputBuffer = '';

process.stdin.on('data', (chunk) => {
  inputBuffer += chunk;
  for (const message of readMessages()) {
    void handleMessage(message);
  }
});

process.stdin.on('end', () => {
  for (const message of readMessages({ flushLines: true })) {
    void handleMessage(message);
  }
});

const handleMessage = async (message) => {
  const id = message?.id;

  try {
    if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      if (id !== undefined) sendError(id, -32600, 'Invalid JSON-RPC request.');
      return;
    }

    if (message.method.startsWith('notifications/')) return;

    switch (message.method) {
      case 'initialize':
        sendResult(id, {
          protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo,
        });
        return;
      case 'tools/list':
        sendResult(id, { tools });
        return;
      case 'tools/call':
        sendResult(id, await callTool(message.params));
        return;
      case 'ping':
        sendResult(id, {});
        return;
      default:
        sendError(id, -32601, `Unsupported method: ${message.method}`);
    }
  } catch (caught) {
    sendError(id, -32603, caught instanceof Error ? caught.message : String(caught));
  }
};

const callTool = async (params) => {
  if (!isObject(params) || typeof params.name !== 'string') {
    throw new Error('tools/call requires a tool name.');
  }

  const args = isObject(params.arguments) ? params.arguments : {};

  switch (params.name) {
    case 'flowguard_list_approved_flows':
      return textResult(await listApprovedFlows());
    case 'flowguard_read_approved_flow':
      return textResult(await readApprovedFlow(requireString(args.flowId, 'flowId')));
    case 'flowguard_write_proposal':
      return textResult(await writeProposal(args));
    default:
      throw new Error(`Unknown Flowguard tool: ${params.name}`);
  }
};

const listApprovedFlows = async () => {
  const { config, flows, invalidDocuments } = await loadApprovedFlows();

  return JSON.stringify(
    {
      repositoryRoot,
      config,
      flows: flows.map((flow) => ({
        id: flow.document.id,
        name: flow.document.name,
        goal: flow.document.goal,
        relativePath: flow.relativePath,
        digest: flow.digest,
        stateCount: flow.document.states.length,
        transitionCount: flow.document.transitions.length,
      })),
      invalidDocuments,
    },
    null,
    2,
  );
};

const readApprovedFlow = async (flowId) => {
  const { flows } = await loadApprovedFlows();
  const flow = flows.find((candidate) => candidate.document.id === flowId);

  if (flow === undefined) {
    throw new Error(`Approved Flowguard contract "${flowId}" was not found.`);
  }

  return JSON.stringify(
    {
      flowId: flow.document.id,
      relativePath: flow.relativePath,
      digest: flow.digest,
      flow: flow.document,
    },
    null,
    2,
  );
};

const writeProposal = async (args) => {
  const proposal = args.proposal;
  const overwrite = args.overwrite === true;

  if (!isObject(proposal)) {
    throw new Error('proposal must be a JSON object.');
  }

  const parsed = parseFlowProposalJson(JSON.stringify(proposal));
  if (!parsed.ok || hasIssueErrors(parsed.issues)) {
    return JSON.stringify(
      {
        ok: false,
        message: 'Proposal did not pass Flowguard validation.',
        issues: parsed.issues,
      },
      null,
      2,
    );
  }

  const { config, flows } = await loadApprovedFlows();
  const flow = flows.find((candidate) => candidate.document.id === parsed.value.flowId);
  if (flow === undefined) {
    throw new Error(`Approved Flowguard contract "${parsed.value.flowId}" was not found.`);
  }

  if (flow.digest !== parsed.value.baseDigest) {
    return JSON.stringify(
      {
        ok: false,
        message:
          'Proposal baseDigest does not match the current approved Flowguard contract digest.',
        expected: flow.digest,
        actual: parsed.value.baseDigest,
      },
      null,
      2,
    );
  }

  const fileName = proposalFileName(parsed.value.id);
  const proposalDirectory = safeJoin(repositoryRoot, '.flowguard', config.proposalDirectory);
  const proposalPath = safeJoin(proposalDirectory, fileName);

  if (!overwrite && (await fileExists(proposalPath))) {
    throw new Error(`Proposal file already exists: ${relativeToRepository(proposalPath)}`);
  }

  await mkdir(dirname(proposalPath), { recursive: true });
  await writeFile(proposalPath, `${serializeCanonicalJson(parsed.value)}\n`, 'utf8');

  return JSON.stringify(
    {
      ok: true,
      proposalId: parsed.value.id,
      flowId: parsed.value.flowId,
      relativePath: relativeToRepository(proposalPath),
    },
    null,
    2,
  );
};

const loadApprovedFlows = async () => {
  const config = await readConfig();
  const flowDirectory = safeJoin(repositoryRoot, '.flowguard', config.flowDirectory);
  const entries = await readJsonDirectory(flowDirectory);
  const flows = [];
  const invalidDocuments = [];

  for (const entry of entries) {
    const fullPath = safeJoin(flowDirectory, entry);
    const text = await readFile(fullPath, 'utf8');
    const parsed = parseFlowguardFlowJson(text);
    const relativePath = relativeToRepository(fullPath);

    if (!parsed.ok || hasIssueErrors(parsed.issues)) {
      invalidDocuments.push({
        relativePath,
        issues: parsed.issues,
      });
      continue;
    }

    flows.push({
      relativePath,
      document: parsed.value,
      digest: await digestFlowguardFlow(parsed.value),
    });
  }

  flows.sort((left, right) => left.document.id.localeCompare(right.document.id));

  return {
    config,
    flows,
    invalidDocuments,
  };
};

const readConfig = async () => {
  const configPath = safeJoin(repositoryRoot, '.flowguard', 'config.json');

  try {
    const parsed = parseFlowguardConfigJson(await readFile(configPath, 'utf8'));
    if (parsed.ok && !hasIssueErrors(parsed.issues)) return parsed.value;
  } catch {
    // Missing or invalid config falls back to MVP defaults.
  }

  return defaultConfigForMissingDocument();
};

const readJsonDirectory = async (directory) => {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

const fileExists = async (path) => {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
};

const proposalFileName = (proposalId) => {
  if (!/^[A-Za-z0-9._-]+$/.test(proposalId) || proposalId === '.' || proposalId === '..') {
    throw new Error(
      'Proposal id must be filename-safe: A-Z, a-z, 0-9, dot, underscore, or hyphen.',
    );
  }

  return `${proposalId}.json`;
};

const safeJoin = (root, ...segments) => {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, ...segments);
  const prefix = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;

  if (target !== resolvedRoot && !target.startsWith(prefix)) {
    throw new Error('Resolved path escaped the Flowguard repository root.');
  }

  return target;
};

const relativeToRepository = (path) => {
  return path.slice(repositoryRoot.length + 1).replaceAll(sep, '/');
};

const requireString = (value, name) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value;
};

const textResult = (text) => {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
};

const sendResult = (id, result) => {
  send({
    jsonrpc: '2.0',
    id,
    result,
  });
};

const sendError = (id, code, message) => {
  send({
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
    },
  });
};

const send = (message) => {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
};

const readMessages = (options = {}) => {
  const messages = [];

  while (inputBuffer.length > 0) {
    if (inputBuffer.startsWith('Content-Length:')) {
      const headerEnd = inputBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = inputBuffer.slice(0, headerEnd);
      const lengthMatch = /^Content-Length:\s*(\d+)/iu.exec(header);
      if (lengthMatch === null) {
        inputBuffer = '';
        break;
      }

      const length = Number(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (inputBuffer.length < bodyEnd) break;

      messages.push(JSON.parse(inputBuffer.slice(bodyStart, bodyEnd)));
      inputBuffer = inputBuffer.slice(bodyEnd);
      continue;
    }

    const newline = inputBuffer.indexOf('\n');
    if (newline === -1) {
      if (options.flushLines === true && inputBuffer.trim().length > 0) {
        messages.push(JSON.parse(inputBuffer.trim()));
        inputBuffer = '';
      }
      break;
    }

    const line = inputBuffer.slice(0, newline).trim();
    inputBuffer = inputBuffer.slice(newline + 1);
    if (line.length > 0) messages.push(JSON.parse(line));
  }

  return messages;
};

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

if (process.argv.includes('--print-repository-root')) {
  console.log(repositoryRoot);
  process.exit(0);
}
