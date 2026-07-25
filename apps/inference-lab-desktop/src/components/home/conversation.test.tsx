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

describe('ChatConversation', () => {
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

  it('renders agent activity with status and output', () => {
    vi.useFakeTimers();
    vi.setSystemTime(102_000);
    render(
      <ChatConversation
        messages={[
          {
            parts: [
              {
                type: 'activity',
                id: 'activity-command-1',
                activities: [
                  {
                    id: 'command-1',
                    kind: 'command',
                    label: 'Ran tests',
                    detail: '12 tests passed',
                    status: 'succeeded',
                  },
                  {
                    id: 'file-1',
                    kind: 'file',
                    label: 'Updating app.tsx',
                    status: 'running',
                  },
                  {
                    id: 'tool-1',
                    kind: 'search',
                    label: 'Queried Database',
                    detail: 'Connection refused',
                    status: 'failed',
                  },
                ],
              },
            ],
            id: 1,
            role: 'assistant',
            startedAtMs: 0,
            streaming: true,
            text: '',
          },
        ]}
      />,
    );

    expect(screen.getByText('Working for 1m 42s')).toBeTruthy();
    const sequenceTrigger = screen.getByRole('button', { name: 'Updating app.tsx' });
    expect(screen.getByText('Updating app.tsx').classList.contains('text-transparent')).toBe(true);
    expect(screen.queryByRole('list', { name: 'Agent activity' })).toBeNull();
    fireEvent.click(sequenceTrigger);
    const sequence = screen.getByLabelText('Task sequence');
    expect(sequence.className).toContain('h-(--collapsible-panel-height)');
    expect(sequence.className).toContain('data-starting-style:h-0');
    expect(sequence.className).toContain('data-ending-style:h-0');
    expect(screen.getByRole('list', { name: 'Agent activity' })).toBeTruthy();
    expect(screen.getByText('Ran tests')).toBeTruthy();
    expect(screen.getAllByText('Updating app.tsx')).toHaveLength(2);
    expect(screen.getByText('Queried Database')).toBeTruthy();
    expect(screen.queryByText('12 tests passed')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ran tests' }));
    expect(screen.getByLabelText('Ran tests details')).toBeTruthy();
    expect(screen.getByText('12 tests passed')).toBeTruthy();
    expect(screen.getAllByLabelText('Running')).toHaveLength(1);
    expect(screen.getByLabelText('Succeeded')).toBeTruthy();
    expect(screen.getByLabelText('Failed')).toBeTruthy();
    expect(screen.queryByText('Thinking')).toBeNull();
  });

  it('renders grouped file activity with collapsed expandable diffs', () => {
    render(
      <ChatConversation
        messages={[
          {
            id: 1,
            role: 'assistant',
            text: '',
            parts: [
              {
                type: 'activity',
                id: 'activity-file-1',
                activities: [
                  {
                    id: 'file-1',
                    kind: 'file',
                    label: 'Updated 2 files',
                    status: 'succeeded',
                    items: [
                      {
                        id: 'file-1-change-0',
                        label: 'Edited app.tsx +2 -1',
                        detail: '@@ -1 +1,2 @@\n-old\n+new\n+added',
                      },
                      {
                        id: 'file-1-change-1',
                        label: 'Created app.test.tsx +1 -0',
                        detail: '@@ -0,0 +1 @@\n+test',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.queryByText('Edited app.tsx +2 -1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edited files' }));
    expect(screen.getByRole('button', { name: 'Edited app.tsx +2 -1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Created app.test.tsx +1 -0' })).toBeTruthy();
    expect(screen.queryByText(/-old/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edited app.tsx +2 -1' }));
    expect(screen.getByText(/-old/)).toBeTruthy();
    expect(screen.getByText(/\+added/)).toBeTruthy();
  });

  it('summarizes completed execution steps in the collapsed task header', () => {
    render(
      <ChatConversation
        messages={[
          {
            id: 1,
            role: 'assistant',
            text: '',
            parts: [
              {
                type: 'activity',
                id: 'activity-execution-1',
                activities: [
                  {
                    id: 'tool-1',
                    kind: 'tool',
                    label: 'Loaded repository tools',
                    status: 'succeeded',
                  },
                  {
                    id: 'read-1',
                    kind: 'read',
                    label: 'Read package.json',
                    status: 'succeeded',
                  },
                  {
                    id: 'read-2',
                    kind: 'read',
                    label: 'Read app.tsx',
                    status: 'succeeded',
                  },
                  {
                    id: 'file-1',
                    kind: 'file',
                    label: 'Edited app.tsx',
                    status: 'succeeded',
                  },
                  {
                    id: 'file-2',
                    kind: 'file',
                    label: 'Edited app.test.tsx',
                    status: 'succeeded',
                  },
                  {
                    id: 'command-1',
                    kind: 'command',
                    label: 'Ran tests',
                    status: 'succeeded',
                  },
                ],
              },
            ],
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Loaded a tool, read files, edited files, ran a command',
      }),
    ).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Agent activity' })).toBeNull();
  });

  it('groups consecutive tasks and keeps the latest completed task shimmering while streaming', () => {
    render(
      <ChatConversation
        messages={[
          {
            id: 1,
            role: 'assistant',
            streaming: true,
            text: '',
            parts: [
              {
                type: 'reasoning',
                id: 'reasoning-1',
                summaries: ['Checking the available sources.'],
              },
              {
                type: 'activity',
                id: 'activity-web-1',
                activities: [
                  {
                    id: 'web-1',
                    kind: 'web',
                    label: 'Searched the documentation',
                    status: 'succeeded',
                  },
                ],
              },
              { type: 'message', id: 'message-empty', text: '' },
            ],
          },
        ]}
      />,
    );

    const latestTask = screen.getByText('Searched the documentation');
    expect(latestTask.classList.contains('text-transparent')).toBe(true);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('Checking the available sources.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Searched the documentation' }));
    expect(screen.getByText('Checking the available sources.')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Agent activity' })).toBeTruthy();
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
