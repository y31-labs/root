// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelSelectDropdown } from '#/components/model-select-dropdown';
import { PermissionSelectDropdown } from '#/components/permission-select-dropdown';
import type { ModelSettingsState } from '#/hooks/use-model-settings';
import type { Model } from '#/lib/types';

afterEach(cleanup);

const model: Model = {
  model: 'gpt-5.6-terra',
  displayName: 'GPT-5.6 Terra',
  effort: { options: ['medium'], default: 'medium' },
  speed: { options: ['standard'], default: 'standard' },
  isDefault: true,
};

const modelSettings: ModelSettingsState = {
  loading: false,
  models: [model],
  selectedModel: model,
  settings: {
    model: model.model,
    effort: 'medium',
    speed: 'standard',
  },
  selectEffort: vi.fn(),
  selectModel: vi.fn(),
  selectSpeed: vi.fn(),
};

describe('PermissionSelectDropdown', () => {
  it('uses the warning color for full access', () => {
    render(
      <PermissionSelectDropdown
        permissionMode='danger-full-access'
        onPermissionModeChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Permissions: Full access' });
    expect(trigger.querySelector('svg')?.classList.contains('text-warning')).toBe(true);
  });

  it('describes each access level, selects workspace access, and closes', async () => {
    const onPermissionModeChange = vi.fn();
    render(
      <PermissionSelectDropdown
        permissionMode='read-only'
        onPermissionModeChange={onPermissionModeChange}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Permissions: Read only' });
    expect(trigger.hasAttribute('data-popup-open')).toBe(false);

    fireEvent.click(trigger);

    expect(await screen.findByText('Inspect files without making changes')).toBeTruthy();
    expect(trigger.hasAttribute('data-popup-open')).toBe(true);
    expect(trigger.className).not.toMatch(/\b(?:basis|grow)-/);
    expect(trigger.className).not.toMatch(/data-popup-open:(?:basis|grow)/);
    expect(screen.getByText('Edit the working folder and ask for broader access')).toBeTruthy();
    expect(screen.getByText('Use the system and network without approval')).toBeTruthy();

    fireEvent.click(screen.getByText('Workspace'));
    expect(onPermissionModeChange).toHaveBeenCalledWith('workspace-write');
    await waitFor(() => expect(trigger.hasAttribute('data-popup-open')).toBe(false));
  });

  it('allows another dropdown or interface control to be used while open', async () => {
    const onAction = vi.fn();
    render(
      <>
        <PermissionSelectDropdown
          permissionMode='read-only'
          onPermissionModeChange={vi.fn()}
        />
        <ModelSelectDropdown modelSettings={modelSettings} />
        <button type='button' onClick={onAction}>
          Other action
        </button>
      </>,
    );

    const permissionTrigger = screen.getByRole('button', { name: 'Permissions: Read only' });
    const modelTrigger = screen.getByRole('button', { name: 'GPT-5.6 Terra Medium' });

    fireEvent.click(permissionTrigger);
    expect(permissionTrigger.hasAttribute('data-popup-open')).toBe(true);

    fireEvent.pointerDown(modelTrigger, { button: 0, pointerType: 'mouse' });
    fireEvent.mouseDown(modelTrigger, { button: 0 });
    await waitFor(() => {
      expect(permissionTrigger.hasAttribute('data-popup-open')).toBe(false);
      expect(modelTrigger.hasAttribute('data-popup-open')).toBe(true);
    });

    const otherAction = screen.getByRole('button', { name: 'Other action' });
    fireEvent.pointerDown(otherAction, { button: 0, pointerType: 'mouse' });
    fireEvent.mouseDown(otherAction, { button: 0 });
    await waitFor(() => expect(modelTrigger.hasAttribute('data-popup-open')).toBe(false));
    fireEvent.click(otherAction);
    expect(onAction).toHaveBeenCalledOnce();
  });
});
