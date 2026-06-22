import type { SemanticIssue } from '@workspace/flowguard-contracts';

import { jsonRangeForPath } from '#/extension/diagnostics/json-ranges';
import type { FlowguardDiagnostic, FlowguardDiagnosticSink } from '#/extension/diagnostics/types';
import type {
  FlowguardDiagnosticDocument,
  FlowguardWorkspaceSnapshot,
} from '#/extension/workspace/types';

export class FlowguardDiagnosticsPublisher {
  readonly #sink: FlowguardDiagnosticSink;
  readonly #knownUris = new Set<string>();
  #disposed = false;

  constructor(sink: FlowguardDiagnosticSink) {
    this.#sink = sink;
  }

  publish(snapshot: FlowguardWorkspaceSnapshot): void {
    if (this.#disposed) return;

    const nextUris = new Set<string>();

    for (const document of snapshot.repositories.flatMap(
      (repository) => repository.diagnosticDocuments,
    )) {
      nextUris.add(document.uri);
      this.#knownUris.add(document.uri);
      this.#sink.set(document.uri, diagnosticsForDocument(document));
    }

    for (const uri of [...this.#knownUris]) {
      if (nextUris.has(uri)) continue;

      this.#sink.delete(uri);
      this.#knownUris.delete(uri);
    }
  }

  dispose(): void {
    if (this.#disposed) return;

    this.#disposed = true;
    for (const uri of [...this.#knownUris]) {
      this.#sink.delete(uri);
    }
    this.#knownUris.clear();
    this.#sink.dispose?.();
  }
}

export const diagnosticsForDocument = (
  document: FlowguardDiagnosticDocument,
): readonly FlowguardDiagnostic[] => {
  return document.issues.map((issue) => diagnosticForIssue(document.text, issue));
};

export const diagnosticForIssue = (text: string, issue: SemanticIssue): FlowguardDiagnostic => {
  return {
    source: 'Flowguard',
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    range: jsonRangeForPath(text, issue.path),
    jsonPath: issue.path,
  };
};
