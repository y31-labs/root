import { describe, expect, it, vi } from 'vitest';

import { createLocalApi } from '#/lib/local-api';

describe('local API', () => {
  it('maps project and generation calls to structured Tauri commands', async () => {
    const invoke = vi.fn(async () => undefined);
    const api = createLocalApi(invoke);

    await api.createProject('Coordinate the monthly vendor review');
    await api.generateProjectRevision('project-1', 'Show overdue owners first', 'version-1');
    await api.saveSettings({ inferenceServiceUrl: 'https://y31.example.com' });

    expect(invoke).toHaveBeenNthCalledWith(1, 'create_project', {
      brief: 'Coordinate the monthly vendor review',
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'generate_project_revision', {
      input: {
        projectId: 'project-1',
        instruction: 'Show overdue owners first',
        baseVersionId: 'version-1',
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'save_settings', {
      input: { inferenceServiceUrl: 'https://y31.example.com' },
    });
  });
});
