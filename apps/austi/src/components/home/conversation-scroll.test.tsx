// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const scrollToBottom = vi.hoisted(() => vi.fn());

vi.mock('use-stick-to-bottom', async () => {
  const React = await import('react');

  const StickToBottom = ({
    initial: _initial,
    resize: _resize,
    ...props
  }: ComponentProps<'div'> & {
    initial?: unknown;
    resize?: unknown;
  }) => React.createElement('div', props);

  StickToBottom.Content = ({ children, ...props }: ComponentProps<'div'>) =>
    React.createElement('div', props, children);

  return {
    StickToBottom,
    useStickToBottomContext: () => ({ scrollToBottom }),
  };
});

import { ChatConversation } from '#/components/home/conversation';

afterEach(() => {
  cleanup();
  scrollToBottom.mockReset();
});

describe('ChatConversation scrolling', () => {
  it('reconnects to the bottom when a new message is added', () => {
    const { rerender } = render(
      <ChatConversation messages={[{ id: 'user-1', role: 'user', text: 'First request' }]} />,
    );

    expect(scrollToBottom).not.toHaveBeenCalled();

    rerender(
      <ChatConversation
        messages={[
          { id: 'user-1', role: 'user', text: 'First request' },
          { id: 'assistant-1', role: 'assistant', text: '' },
        ]}
      />,
    );

    expect(scrollToBottom).toHaveBeenCalledOnce();
    expect(scrollToBottom).toHaveBeenCalledWith('instant');

    scrollToBottom.mockClear();
    rerender(
      <ChatConversation
        messages={[
          { id: 'user-1', role: 'user', text: 'First request' },
          { id: 'assistant-1', role: 'assistant', text: 'Streaming response' },
        ]}
      />,
    );

    expect(scrollToBottom).not.toHaveBeenCalled();
  });
});
