import {
  defaultConfigForMissingDocument,
  digestFlowguardFlow,
  digestFlowProposal,
  digestFlowguardConfig,
  parseFlowguardFlowJson,
  parseFlowProposalJson,
  parseFlowguardConfigJson,
} from '@workspace/flowguard-contracts';
import type {
  FlowguardFlow,
  CanonicalDigest,
  FlowProposal,
  ParseResult,
  SemanticIssue,
} from '@workspace/flowguard-contracts';

import {
  FLOWGUARD_CONFIG_FILE,
  FLOWGUARD_DIRECTORY,
  FLOWGUARD_WATCH_PATTERN,
  type FlowguardDiagnosticDocument,
  type FlowguardFlowDocumentSnapshot,
  type FlowguardRepositorySnapshot,
  type FlowguardWorkspaceSnapshot,
  type FlowProposalDocumentSnapshot,
  type InvalidFlowguardDocumentKind,
  type InvalidFlowguardDocumentSnapshot,
  type FlowguardConfigSnapshot,
  type WorkspaceDirectoryEntry,
  type WorkspaceFileSystem,
  type WorkspaceRoot,
} from '#/extension/workspace/types';
import { joinRepositoryPath, joinRepositoryUri } from '#/extension/workspace/uri';

export interface DiscoverFlowguardWorkspaceOptions {
  readonly workspaceRoots: readonly WorkspaceRoot[] | undefined;
  readonly fs: WorkspaceFileSystem;
  readonly sequence?: number;
  readonly generatedAt?: string;
}

interface ReadDocument {
  readonly uri: string;
  readonly relativePath: string;
  readonly text: string;
}

interface ValidDocumentCommon {
  readonly root: WorkspaceRoot;
  readonly uri: string;
  readonly relativePath: string;
  readonly valid: true;
  readonly digest: CanonicalDigest;
  readonly issues: readonly SemanticIssue[];
}

interface ParseDocumentOptions<TDocument, TSnapshot> {
  readonly kind: 'flow' | 'proposal';
  readonly root: WorkspaceRoot;
  readonly readDocument: ReadDocument;
  readonly parse: (text: string) => ParseResult<TDocument>;
  readonly digest: (document: TDocument) => Promise<CanonicalDigest>;
  readonly createSnapshot: (common: ValidDocumentCommon, document: TDocument) => TSnapshot;
}

export const discoverFlowguardWorkspace = async (
  options: DiscoverFlowguardWorkspaceOptions,
): Promise<FlowguardWorkspaceSnapshot> => {
  const roots = [...(options.workspaceRoots ?? [])].sort(compareWorkspaceRoots);
  const repositories = await Promise.all(roots.map((root) => discoverRepository(root, options.fs)));

  return {
    version: 1,
    sequence: options.sequence ?? 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    repositories,
  };
};

const discoverRepository = async (
  root: WorkspaceRoot,
  fs: WorkspaceFileSystem,
): Promise<FlowguardRepositorySnapshot> => {
  const diagnosticDocuments: FlowguardDiagnosticDocument[] = [];
  const invalidDocuments: InvalidFlowguardDocumentSnapshot[] = [];
  const config = await discoverConfig(root, fs, diagnosticDocuments, invalidDocuments);
  const flowDirectory = config.activeConfig.flowDirectory;
  const proposalDirectory = config.activeConfig.proposalDirectory;
  const flows = await discoverJsonDocuments({
    fs,
    root,
    kind: 'flow',
    directory: flowDirectory,
    diagnosticDocuments,
    invalidDocuments,
    parse: parseFlowguardFlowJson,
    digest: digestFlowguardFlow,
    createSnapshot: (common, document) => ({
      ...common,
      kind: 'flow',
      document,
    }),
  });
  const proposals = await discoverJsonDocuments({
    fs,
    root,
    kind: 'proposal',
    directory: proposalDirectory,
    diagnosticDocuments,
    invalidDocuments,
    parse: parseFlowProposalJson,
    digest: digestFlowProposal,
    createSnapshot: (common, document) => ({
      ...common,
      kind: 'proposal',
      document,
    }),
  });

  return {
    root,
    config,
    flows,
    proposals,
    invalidDocuments,
    diagnosticDocuments,
    watchPatterns: [FLOWGUARD_WATCH_PATTERN],
  };
};

const discoverConfig = async (
  root: WorkspaceRoot,
  fs: WorkspaceFileSystem,
  diagnosticDocuments: FlowguardDiagnosticDocument[],
  invalidDocuments: InvalidFlowguardDocumentSnapshot[],
): Promise<FlowguardConfigSnapshot> => {
  const relativePath = joinRepositoryPath(FLOWGUARD_DIRECTORY, FLOWGUARD_CONFIG_FILE);
  const uri = joinRepositoryUri(root.uri, relativePath);
  const fallbackConfig = defaultConfigForMissingDocument();
  const fallbackDigest = await digestFlowguardConfig(fallbackConfig);
  const text = await tryReadFile(fs, uri);

  if (text === undefined) {
    return {
      kind: 'config',
      root,
      uri,
      relativePath,
      source: 'default',
      valid: true,
      activeConfig: fallbackConfig,
      digest: fallbackDigest,
      issues: [],
    };
  }

  const result = parseFlowguardConfigJson(text);
  diagnosticDocuments.push({
    kind: 'config',
    uri,
    relativePath,
    text,
    issues: result.issues,
  });

  if (!result.ok) {
    invalidDocuments.push(toInvalidDocument('config', root, uri, relativePath, result.issues));

    return {
      kind: 'config',
      root,
      uri,
      relativePath,
      source: 'file',
      valid: false,
      activeConfig: fallbackConfig,
      digest: fallbackDigest,
      issues: result.issues,
    };
  }

  const documentDigest = await digestFlowguardConfig(result.value);

  return {
    kind: 'config',
    root,
    uri,
    relativePath,
    source: 'file',
    valid: true,
    activeConfig: result.value,
    document: result.value,
    digest: documentDigest,
    documentDigest,
    issues: result.issues,
  };
};

const discoverJsonDocuments = async <
  TDocument extends FlowguardFlow | FlowProposal,
  TSnapshot extends FlowguardFlowDocumentSnapshot | FlowProposalDocumentSnapshot,
>(options: {
  readonly fs: WorkspaceFileSystem;
  readonly root: WorkspaceRoot;
  readonly kind: 'flow' | 'proposal';
  readonly directory: string;
  readonly diagnosticDocuments: FlowguardDiagnosticDocument[];
  readonly invalidDocuments: InvalidFlowguardDocumentSnapshot[];
  readonly parse: (text: string) => ParseResult<TDocument>;
  readonly digest: (document: TDocument) => Promise<CanonicalDigest>;
  readonly createSnapshot: (common: ValidDocumentCommon, document: TDocument) => TSnapshot;
}): Promise<readonly TSnapshot[]> => {
  const directoryUri = joinRepositoryUri(options.root.uri, FLOWGUARD_DIRECTORY, options.directory);
  const entries = await readJsonDirectory(options.fs, directoryUri);
  const documents = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = joinRepositoryPath(FLOWGUARD_DIRECTORY, options.directory, entry.name);
      const uri = joinRepositoryUri(options.root.uri, relativePath);
      const text = await tryReadFile(options.fs, uri);
      if (text === undefined) return undefined;

      return parseRepositoryDocument({
        kind: options.kind,
        root: options.root,
        readDocument: { uri, relativePath, text },
        parse: options.parse,
        digest: options.digest,
        createSnapshot: options.createSnapshot,
      });
    }),
  );
  const snapshots = documents.filter((document) => document !== undefined);

  for (const snapshot of snapshots) {
    options.diagnosticDocuments.push({
      kind: snapshot.kind,
      uri: snapshot.uri,
      relativePath: snapshot.relativePath,
      text: snapshot.text,
      issues: snapshot.issues,
    });

    if (!snapshot.valid) {
      options.invalidDocuments.push(
        toInvalidDocument(
          snapshot.kind,
          options.root,
          snapshot.uri,
          snapshot.relativePath,
          snapshot.issues,
        ),
      );
    }
  }

  return snapshots
    .filter((snapshot): snapshot is ValidParsedRepositoryDocument<TSnapshot> => snapshot.valid)
    .map((snapshot) => snapshot.document);
};

type ParsedRepositoryDocument<TSnapshot> =
  | {
      readonly kind: 'flow' | 'proposal';
      readonly uri: string;
      readonly relativePath: string;
      readonly text: string;
      readonly valid: false;
      readonly issues: readonly SemanticIssue[];
    }
  | ValidParsedRepositoryDocument<TSnapshot>;

interface ValidParsedRepositoryDocument<TSnapshot> {
  readonly kind: 'flow' | 'proposal';
  readonly uri: string;
  readonly relativePath: string;
  readonly text: string;
  readonly valid: true;
  readonly issues: readonly SemanticIssue[];
  readonly document: TSnapshot;
}

const parseRepositoryDocument = async <TDocument, TSnapshot>({
  kind,
  root,
  readDocument,
  parse,
  digest,
  createSnapshot,
}: ParseDocumentOptions<TDocument, TSnapshot>): Promise<ParsedRepositoryDocument<TSnapshot>> => {
  const result = parse(readDocument.text);

  if (!result.ok) {
    return {
      kind,
      uri: readDocument.uri,
      relativePath: readDocument.relativePath,
      text: readDocument.text,
      valid: false,
      issues: result.issues,
    };
  }

  const parsedDigest = await digest(result.value);
  const common = {
    root,
    uri: readDocument.uri,
    relativePath: readDocument.relativePath,
    valid: true as const,
    digest: parsedDigest,
    issues: result.issues,
  } satisfies ValidDocumentCommon;

  return {
    kind,
    uri: readDocument.uri,
    relativePath: readDocument.relativePath,
    text: readDocument.text,
    valid: true,
    issues: result.issues,
    document: createSnapshot(common, result.value),
  };
};

const readJsonDirectory = async (
  fs: WorkspaceFileSystem,
  uri: string,
): Promise<readonly WorkspaceDirectoryEntry[]> => {
  const entries = await tryReadDirectory(fs, uri);

  return entries
    .filter((entry) => entry.type !== 'directory' && entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name));
};

const tryReadFile = async (fs: WorkspaceFileSystem, uri: string): Promise<string | undefined> => {
  try {
    return await fs.readFile(uri);
  } catch {
    return undefined;
  }
};

const tryReadDirectory = async (
  fs: WorkspaceFileSystem,
  uri: string,
): Promise<readonly WorkspaceDirectoryEntry[]> => {
  try {
    return await fs.readDirectory(uri);
  } catch {
    return [];
  }
};

const toInvalidDocument = (
  kind: InvalidFlowguardDocumentKind,
  root: WorkspaceRoot,
  uri: string,
  relativePath: string,
  issues: readonly SemanticIssue[],
): InvalidFlowguardDocumentSnapshot => {
  return {
    kind,
    root,
    uri,
    relativePath,
    valid: false,
    issues,
  };
};

const compareWorkspaceRoots = (left: WorkspaceRoot, right: WorkspaceRoot): number => {
  return (
    left.index - right.index ||
    left.name.localeCompare(right.name) ||
    left.uri.localeCompare(right.uri)
  );
};
