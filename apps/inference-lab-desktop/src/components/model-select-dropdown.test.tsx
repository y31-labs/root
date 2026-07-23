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
    effort: { options: ['low', 'medium'], default: 'medium' },
    speed: { options: ['standard', 'fast'], default: 'standard' },
    isDefault: true,
  },
  {
    model: 'gpt-5.6-sol',
    displayName: 'GPT-5.6 Sol',
    effort: { options: ['high'], default: 'high' },
    speed: { options: ['standard'], default: 'standard' },
    isDefault: false,
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
        speed: 'standard',
      },
      selectEffort: vi.fn(),
      selectModel: vi.fn(),
      selectSpeed: vi.fn(),
    };

    const { getByText, queryByLabelText } = render(
      <ModelSelectDropdown modelSettings={modelSettings} />,
    );

    expect(getByText('GPT-5.6 Terra')).toBeTruthy();
    expect(getByText('Medium')).toBeTruthy();
    expect(queryByLabelText('Fast mode')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'GPT-5.6 Terra Medium' }));
    expect(await screen.findByText('ChatGPT')).toBeTruthy();
    expect(screen.getByText('API')).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();

    const selectedModelItem = screen.getByRole('menuitem', { name: 'GPT-5.6 Terra' });
    const otherModelItem = screen.getByRole('menuitem', { name: 'GPT-5.6 Sol' });
    expect(selectedModelItem.classList.contains('text-muted-foreground')).toBe(false);
    expect(otherModelItem.classList.contains('text-muted-foreground')).toBe(true);

    fireEvent.click(selectedModelItem);

    expect(await screen.findByText('Effort')).toBeTruthy();
    expect(screen.getByText('Speed')).toBeTruthy();
    expect(await screen.findByText('1.5x faster, higher usage')).toBeTruthy();
  });

  it('selects a model from its submenu trigger', async () => {
    const selectModel = vi.fn();
    const modelSettings: ModelSettingsState = {
      loading: false,
      models,
      selectedModel: models[0],
      settings: {
        model: 'gpt-5.6-terra',
        effort: 'medium',
        speed: 'standard',
      },
      selectEffort: vi.fn(),
      selectModel,
      selectSpeed: vi.fn(),
    };

    render(<ModelSelectDropdown modelSettings={modelSettings} />);

    fireEvent.click(screen.getByRole('button', { name: 'GPT-5.6 Terra Medium' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'GPT-5.6 Sol' }));

    expect(selectModel).toHaveBeenCalledWith('gpt-5.6-sol');
    expect(await screen.findByText('Effort')).toBeTruthy();
    expect(screen.queryByText('Speed')).toBeNull();
  });

  it('hides effort when the model has no effort mode', async () => {
    const modelWithoutEffort: Model = {
      model: 'basic-model',
      displayName: 'Basic Model',
      effort: { options: ['none'], default: 'none' },
      speed: { options: ['standard', 'fast'], default: 'standard' },
      isDefault: true,
    };
    const modelSettings: ModelSettingsState = {
      loading: false,
      models: [modelWithoutEffort],
      selectedModel: modelWithoutEffort,
      settings: {
        model: 'basic-model',
        effort: 'none',
        speed: 'standard',
      },
      selectEffort: vi.fn(),
      selectModel: vi.fn(),
      selectSpeed: vi.fn(),
    };

    render(<ModelSelectDropdown modelSettings={modelSettings} />);

    fireEvent.click(screen.getByRole('button', { name: 'Basic Model None' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Basic Model' }));

    expect(await screen.findByText('Speed')).toBeTruthy();
    expect(screen.queryByText('Effort')).toBeNull();
  });

  it('shows the fast mode icon in the trigger when fast mode is selected', () => {
    const modelSettings: ModelSettingsState = {
      loading: false,
      models,
      selectedModel: models[0],
      settings: {
        model: 'gpt-5.6-terra',
        effort: 'low',
        speed: 'fast',
      },
      selectEffort: vi.fn(),
      selectModel: vi.fn(),
      selectSpeed: vi.fn(),
    };

    const { container } = render(<ModelSelectDropdown modelSettings={modelSettings} />);

    expect(screen.getByRole('button', { name: 'GPT-5.6 Terra Light Fast mode' })).toBeTruthy();
    const fastIcon = screen.getByLabelText('Fast mode');
    expect(fastIcon.classList.contains('fill-current')).toBe(true);
    expect(container.querySelector('button')?.firstElementChild).toBe(fastIcon);
  });
});
