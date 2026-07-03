import {
  defaultConfigForMissingDocument,
  serializeCanonicalJson,
} from '@workspace/flowguard-contracts';

import {
  FLOWGUARD_CONFIG_FILE,
  FLOWGUARD_DIRECTORY,
  type FlowguardConfigSnapshot,
  type WorkspaceRoot,
} from '#/extension/workspace/types';
import { joinRepositoryUri } from '#/extension/workspace/uri';

export interface FlowguardRepositoryInitializationFileSystem {
  createDirectory(uri: string): Promise<void>;
  readFile?(uri: string): Promise<string>;
  writeFile(uri: string, text: string): Promise<void>;
}

export interface InitializeFlowguardRepositoryOptions {
  readonly root: WorkspaceRoot;
  readonly fs: FlowguardRepositoryInitializationFileSystem;
  readonly overwriteConfig?: boolean;
}

export interface InitializeFlowguardRepositoryResult {
  readonly root: WorkspaceRoot;
  readonly configUri: string;
  readonly flowDirectoryUri: string;
  readonly proposalDirectoryUri: string;
  readonly coverageDirectoryUri: string;
  readonly configWritten: boolean;
  readonly message: string;
}

export const initializeFlowguardRepository = async (
  options: InitializeFlowguardRepositoryOptions,
): Promise<InitializeFlowguardRepositoryResult> => {
  const config = defaultConfigForMissingDocument();
  const flowguardUri = joinRepositoryUri(options.root.uri, FLOWGUARD_DIRECTORY);
  const configUri = joinRepositoryUri(flowguardUri, FLOWGUARD_CONFIG_FILE);
  const flowDirectoryUri = joinRepositoryUri(flowguardUri, config.flowDirectory);
  const proposalDirectoryUri = joinRepositoryUri(flowguardUri, config.proposalDirectory);
  const coverageDirectoryUri = joinRepositoryUri(flowguardUri, config.coverageDirectory);

  await options.fs.createDirectory(flowguardUri);
  await options.fs.createDirectory(flowDirectoryUri);
  await options.fs.createDirectory(proposalDirectoryUri);
  await options.fs.createDirectory(coverageDirectoryUri);

  const configExists =
    options.overwriteConfig === true ? false : await canReadFile(options.fs, configUri);
  if (!configExists) {
    await options.fs.writeFile(configUri, `${serializeCanonicalJson(config)}\n`);
  }

  return {
    root: options.root,
    configUri,
    flowDirectoryUri,
    proposalDirectoryUri,
    coverageDirectoryUri,
    configWritten: !configExists,
    message: configExists
      ? `Flowguard already initialized in ${options.root.name}.`
      : `Initialized Flowguard in ${options.root.name}.`,
  };
};

const canReadFile = async (
  fs: FlowguardRepositoryInitializationFileSystem,
  uri: FlowguardConfigSnapshot['uri'],
): Promise<boolean> => {
  if (fs.readFile === undefined) return false;

  try {
    await fs.readFile(uri);
    return true;
  } catch {
    return false;
  }
};
