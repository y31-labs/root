// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@workspace/ui/components/ai-elements/prompt-input';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

describe('PromptInput', () => {
  it('submits the form with Enter and keeps Shift+Enter for a newline', async () => {
    const onSubmit = vi.fn();

    render(
      <PromptInput onSubmit={onSubmit}>
        <PromptInputTextarea aria-label='Prompt' defaultValue='Build a dashboard' />
        <PromptInputSubmit />
      </PromptInput>,
    );

    const textarea = screen.getByRole('textbox', { name: 'Prompt' });

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { files: [], text: 'Build a dashboard' },
        expect.anything(),
      ),
    );
  });

  it('does not submit with Enter when the form submit button is disabled', () => {
    const onSubmit = vi.fn();

    render(
      <PromptInput onSubmit={onSubmit}>
        <PromptInputTextarea aria-label='Prompt' defaultValue='Build a dashboard' />
        <PromptInputSubmit disabled />
      </PromptInput>,
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Prompt' }), { key: 'Enter' });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
