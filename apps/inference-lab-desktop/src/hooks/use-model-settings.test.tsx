// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useModelSettings } from '#/hooks/use-model-settings';
import type { Model } from '#/lib/types';

afterEach(cleanup);

const models: Model[] = [
  {
    model: 'balanced-model',
    displayName: 'Balanced Model',
    supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'medium' }],
    defaultReasoningEffort: 'medium',
    serviceTiers: [{ id: 'priority', name: 'Fast' }],
    defaultServiceTier: null,
    isDefault: true,
  },
];

describe('useModelSettings', () => {
  it('loads a model catalog and owns its selected settings', async () => {
    const loadModels = vi.fn(async () => models);
    const { result } = renderHook(() => useModelSettings(loadModels));

    await waitFor(() =>
      expect(result.current.settings).toEqual({
        model: 'balanced-model',
        effort: 'medium',
        serviceTier: null,
      }),
    );

    act(() => result.current.selectEffort('low'));
    act(() => result.current.selectServiceTier('priority'));

    expect(result.current.settings).toEqual({
      model: 'balanced-model',
      effort: 'low',
      serviceTier: 'priority',
    });
    expect(result.current.selectedModel).toBe(models[0]);
    expect(loadModels).toHaveBeenCalledOnce();
  });
});
