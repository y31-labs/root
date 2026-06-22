export const semanticIssueCodes = [
  'INVALID_JSON',
  'UNSUPPORTED_VERSION',
  'MISSING_REQUIRED_FIELD',
  'UNKNOWN_FIELD',
  'INVALID_TYPE',
  'INVALID_VALUE',
  'INVALID_ID',
  'DUPLICATE_ID',
  'EMPTY_COLLECTION',
  'BROKEN_REFERENCE',
  'UNSAFE_PATH',
  'IMPLEMENTATION_ACTION',
  'DUPLICATE_TRANSITION',
  'UNREACHABLE_STATE',
  'INVALID_DIGEST',
  'STALE_DIGEST',
  'FLOW_ID_MISMATCH',
  'OPERATION_CONFLICT',
] as const;

export type SemanticIssueCode = (typeof semanticIssueCodes)[number];
export type SemanticIssueSeverity = 'error' | 'warning';

export interface SemanticIssue {
  code: SemanticIssueCode;
  severity: SemanticIssueSeverity;
  path: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}

export interface ParseSuccess<T> {
  ok: true;
  value: T;
  issues: SemanticIssue[];
}

export interface ParseFailure {
  ok: false;
  issues: SemanticIssue[];
}

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export const issue = (
  code: SemanticIssueCode,
  severity: SemanticIssueSeverity,
  path: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): SemanticIssue => {
  return details === undefined
    ? { code, severity, path, message }
    : { code, severity, path, message, details };
};

export const errorIssue = (
  code: SemanticIssueCode,
  path: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): SemanticIssue => {
  return issue(code, 'error', path, message, details);
};

export const warningIssue = (
  code: SemanticIssueCode,
  path: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): SemanticIssue => {
  return issue(code, 'warning', path, message, details);
};

export const hasIssueErrors = (issues: readonly SemanticIssue[]): boolean => {
  return issues.some((item) => item.severity === 'error');
};

export const parseResult = <T>(value: T | undefined, issues: SemanticIssue[]): ParseResult<T> => {
  if (value !== undefined && !hasIssueErrors(issues)) {
    return { ok: true, value, issues };
  }

  return { ok: false, issues };
};
