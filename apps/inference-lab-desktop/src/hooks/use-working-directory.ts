import { open } from '@tauri-apps/plugin-dialog';

import { useLocalStorage } from '#/hooks/use-local-storage';

const WORKING_DIRECTORY_KEY = 'y31:working-directory';

export const useWorkingDirectory = () => {
  const [workingDirectory, setWorkingDirectory] = useLocalStorage(WORKING_DIRECTORY_KEY);

  const selectWorkingDirectory = () => {
    void (async () => {
      const selected = await open({
        defaultPath: workingDirectory,
        directory: true,
        multiple: false,
      });
      if (!selected || Array.isArray(selected)) return;
      setWorkingDirectory(selected);
    })();
  };

  return { selectWorkingDirectory, workingDirectory };
};
