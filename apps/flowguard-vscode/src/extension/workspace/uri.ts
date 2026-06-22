export const joinRepositoryPath = (...segments: readonly string[]): string => {
  return segments
    .flatMap((segment) => segment.split('/'))
    .filter((segment) => segment.length > 0)
    .join('/');
};

export const joinRepositoryUri = (baseUri: string, ...segments: readonly string[]): string => {
  const path = joinRepositoryPath(...segments);
  if (path.length === 0) return trimTrailingSlashes(baseUri);

  return `${trimTrailingSlashes(baseUri)}/${path}`;
};

const trimTrailingSlashes = (value: string): string => {
  if (value === '/') return value;
  const trimmed = value.replace(/\/+$/u, '');
  return trimmed.length === 0 ? '/' : trimmed;
};
