import { useLocalStorage } from '#/hooks/use-local-storage';
import type { PermissionMode } from '#/lib/types';

const PERMISSION_MODE_KEY = 'y31:permission-mode';
const DEFAULT_PERMISSION_MODE: PermissionMode = 'read-only';

const isPermissionMode = (value: string | undefined): value is PermissionMode =>
  value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access';

export const usePermissionMode = () => {
  const [storedMode, setStoredMode] = useLocalStorage(PERMISSION_MODE_KEY);
  const permissionMode = isPermissionMode(storedMode) ? storedMode : DEFAULT_PERMISSION_MODE;

  return { permissionMode, setPermissionMode: setStoredMode };
};
