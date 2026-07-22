// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
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

afterEach(cleanup);

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
});
