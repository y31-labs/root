// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ChatConversation } from '#/components/home/conversation';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ChatConversation messages', () => {
  it('keeps the conversation blank while saved history is loading', () => {
    render(<ChatConversation loading messages={[]} />);

    expect(screen.getByRole('log')).toBeTruthy();
    expect(screen.queryByText('What should we build?')).toBeNull();
    expect(screen.queryByText('Describe an internal tool, workflow, or process.')).toBeNull();
  });

  it('renders assistant messages as Markdown', () => {
    render(
      <ChatConversation
        messages={[
          {
            id: 1,
            role: 'assistant',
            text: '## Build result\n\n- **Created** the dashboard',
          },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Build result' }).tagName).toBe('H2');
    expect(screen.getByText('Created').dataset.streamdown).toBe('strong');
    expect(screen.getByRole('list')).toBeTruthy();
    expect(screen.getByRole('log').className).toContain('overflow-y-hidden');
  });

  it('renders file attachments in user messages', () => {
    render(
      <ChatConversation
        messages={[
          {
            attachments: [
              {
                filename: 'layout.png',
                id: 'image-1',
                mediaType: 'image/png',
                type: 'file',
                url: 'data:image/png;base64,aW1hZ2U=',
              },
              {
                filename: 'brief.pdf',
                id: 'file-2',
                mediaType: 'application/pdf',
                type: 'file',
                url: 'data:application/pdf;base64,ZmlsZQ==',
              },
            ],
            id: 1,
            role: 'user',
            text: 'Match this layout',
          },
        ]}
      />,
    );

    const image = screen.getByRole('img', { name: 'layout.png' });
    expect(image.getAttribute('src')).toBe('data:image/png;base64,aW1hZ2U=');
    expect(screen.getByText('brief.pdf')).toBeTruthy();
  });

  it('renders approval controls and returns the selected decision', () => {
    const onApprovalDecision = vi.fn();
    render(
      <ChatConversation
        messages={[
          {
            approvals: [
              {
                requestId: 42,
                method: 'item/commandExecution/requestApproval',
                title: 'Allow command?',
                detail: 'bun test',
                status: 'pending',
              },
            ],
            id: 1,
            role: 'assistant',
            text: '',
          },
        ]}
        onApprovalDecision={onApprovalDecision}
      />,
    );

    expect(screen.getByText('bun test')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Allow for session' }));
    expect(onApprovalDecision).toHaveBeenCalledWith(
      42,
      'item/commandExecution/requestApproval',
      'acceptForSession',
    );
  });

  it('renders messages, reasoning, and activity in stream order', () => {
    const { container } = render(
      <ChatConversation
        messages={[
          {
            id: 1,
            role: 'assistant',
            streaming: true,
            text: '',
            parts: [
              { type: 'message', id: 'message-1', text: 'I’ll inspect the project.' },
              {
                type: 'activity',
                id: 'activity-command-1',
                activities: [
                  {
                    id: 'command-1',
                    kind: 'command',
                    label: 'Ran tests',
                    status: 'succeeded',
                  },
                ],
              },
              {
                type: 'reasoning',
                id: 'reasoning-1',
                summaries: ['**The tests** point to the rendering path.'],
              },
              { type: 'message', id: 'message-2', text: 'The first check passed.' },
              {
                type: 'activity',
                id: 'activity-command-2',
                activities: [
                  {
                    id: 'command-2',
                    kind: 'command',
                    label: 'Running typecheck',
                    status: 'running',
                  },
                ],
              },
            ],
          },
        ]}
      />,
    );

    const collapsedContent = container.textContent ?? '';
    expect(collapsedContent.indexOf('I’ll inspect the project.')).toBeLessThan(
      collapsedContent.indexOf('Ran a command'),
    );
    expect(collapsedContent.indexOf('Ran a command')).toBeLessThan(
      collapsedContent.indexOf('The first check passed.'),
    );
    expect(collapsedContent.indexOf('The first check passed.')).toBeLessThan(
      collapsedContent.indexOf('Running typecheck'),
    );
    expect(screen.queryByText('Ran tests')).toBeNull();
    expect(screen.getByText('Running typecheck').classList.contains('text-transparent')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Ran a command' }));
    expect(screen.getByText('Ran tests')).toBeTruthy();
    expect(
      screen
        .getAllByText('Thinking')
        .every((element) => !element.classList.contains('font-semibold')),
    ).toBe(true);
    const emphasizedReasoning = screen.getByText('The tests');
    expect(emphasizedReasoning.dataset.streamdown).toBe('strong');
    expect(emphasizedReasoning.closest('.h-auto')?.className).toContain(
      '[&_[data-streamdown=strong]]:font-normal',
    );
  });
});
