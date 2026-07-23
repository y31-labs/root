// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@workspace/ui/components/ai-elements/prompt-input';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatInput } from '#/components/prompt-input/chat-input';
import type { ModelSettingsState } from '#/hooks/use-model-settings';

const ignoreSelection = () => undefined;
const modelSettings: ModelSettingsState = {
  loading: false,
  models: [],
  selectReason: ignoreSelection,
  selectModel: ignoreSelection,
  selectSpeed: ignoreSelection,
};

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
    const mediaType =
      object instanceof Blob && object.type ? object.type : 'application/octet-stream';
    return `data:${mediaType};base64,aW1hZ2U=`;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  it('previews and submits an attached image without prompt text', async () => {
    const onSubmit = vi.fn();

    render(
      <ChatInput
        modelSettings={modelSettings}
        pending={false}
        prompt=''
        onPromptChange={vi.fn()}
        onSelectWorkingDirectory={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const fileInput = screen.getByLabelText('Upload files');
    const fileInputClick = vi.spyOn(fileInput, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Attach files' }));
    expect(fileInputClick).toHaveBeenCalledOnce();

    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit.hasAttribute('disabled')).toBe(true);

    const image = new File(['image'], 'layout.png', { type: 'image/png' });
    fireEvent.change(fileInput, {
      target: { files: [image] },
    });

    expect(await screen.findByRole('img', { name: 'layout.png' })).toBeTruthy();
    expect(submit.hasAttribute('disabled')).toBe(false);

    fireEvent.click(submit);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        {
          files: [
            {
              filename: 'layout.png',
              mediaType: 'image/png',
              type: 'file',
              url: 'data:image/png;base64,aW1hZ2U=',
            },
          ],
          text: '',
        },
        expect.anything(),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('img', { name: 'layout.png' })).toBeNull());
  });

  it('previews and submits a non-image file', async () => {
    const onSubmit = vi.fn();
    render(
      <ChatInput
        modelSettings={modelSettings}
        pending={false}
        prompt=''
        onPromptChange={vi.fn()}
        onSelectWorkingDirectory={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const file = new File(['brief'], 'brief.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Upload files'), {
      target: { files: [file] },
    });

    expect(await screen.findByText('brief.pdf')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        {
          files: [
            {
              filename: 'brief.pdf',
              mediaType: 'application/pdf',
              type: 'file',
              url: 'data:application/pdf;base64,aW1hZ2U=',
            },
          ],
          text: '',
        },
        expect.anything(),
      ),
    );
  });

  it('selects and displays the working folder', () => {
    const onSelectWorkingDirectory = vi.fn();

    const { rerender } = render(
      <ChatInput
        modelSettings={modelSettings}
        pending={false}
        prompt=''
        onPromptChange={vi.fn()}
        onSelectWorkingDirectory={onSelectWorkingDirectory}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select working folder' }));
    expect(onSelectWorkingDirectory).toHaveBeenCalledOnce();

    rerender(
      <ChatInput
        modelSettings={modelSettings}
        pending={false}
        prompt=''
        workingDirectory='/Users/example/inventory-tool'
        onPromptChange={vi.fn()}
        onSelectWorkingDirectory={onSelectWorkingDirectory}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Change working folder: /Users/example/inventory-tool',
      }).textContent,
    ).toContain('inventory-tool');
  });
});
