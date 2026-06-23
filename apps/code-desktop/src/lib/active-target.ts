const activeRepositoryKey = 'code-desktop.activeRepositoryId';
const activeTargetPrefix = 'code-desktop.activeTargetId.';

export const getActiveRepositoryId = () =>
  typeof window === 'undefined' ? undefined : localStorage.getItem(activeRepositoryKey) || undefined;

export const setActiveRepositoryId = (repositoryId: string) => {
  localStorage.setItem(activeRepositoryKey, repositoryId);
};

export const getActiveTargetId = (repositoryId: string) =>
  typeof window === 'undefined'
    ? undefined
    : localStorage.getItem(`${activeTargetPrefix}${repositoryId}`) || undefined;

export const setActiveTargetId = (repositoryId: string, targetId?: string) => {
  const key = `${activeTargetPrefix}${repositoryId}`;
  if (targetId) localStorage.setItem(key, targetId);
  else localStorage.removeItem(key);
};
