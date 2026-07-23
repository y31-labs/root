// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelSelectDropdown } from '#/components/model-select-dropdown';
import type { ModelSettingsState } from '#/hooks/use-model-settings';
import type { Model } from '#/lib/types';

afterEach(cleanup);

const models: Model[] = [
  {
    model: 'gpt-5.6-terra',
    displayName: 'GPT-5.6 Terra',
    supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'medium' }],
    defaultReasoningEffort: 'medium',
    serviceTiers: [{ id: 'priority', name: 'Fast' }],
    defaultServiceTier: null,
    isDefault: true,
  },
];

describe('ModelSelectDropdown', () => {
  it('displays the selected model settings and describes fast mode usage', async () => {
    const modelSettings: ModelSettingsState = {
      loading: false,
      models,
      selectedModel: models[0],
      settings: {
        model: 'gpt-5.6-terra',
        effort: 'medium',
        serviceTier: null,
      },
      selectEffort: vi.fn(),
      selectModel: vi.fn(),
      selectServiceTier: vi.fn(),
    };

    const { getByText, queryByText } = render(
      <ModelSelectDropdown modelSettings={modelSettings} />,
    );

    expect(getByText('GPT-5.6 Terra')).toBeTruthy();
    expect(queryByText('Medium')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'GPT-5.6 Terra' }));
    fireEvent.click(await screen.findByText('Speed'));

    expect(await screen.findByText('1.5x faster, higher usage')).toBeTruthy();
  });
});
