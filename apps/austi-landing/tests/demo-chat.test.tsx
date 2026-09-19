import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DemoChat } from '../src/components/DemoChat';
import { createDemoSession } from '../src/lib/demo-session';
import type { useDemoChat } from '../src/lib/use-demo-chat';

const state = vi.hoisted(() => ({ chat: {} as ReturnType<typeof useDemoChat> }));
vi.mock('../src/lib/use-demo-chat', () => ({ useDemoChat: () => state.chat }));
vi.mock('../src/components/DemoVerification', () => ({
  DemoVerification: ({ onToken }: { onToken: (token: string) => void }) => (
    <button onClick={() => onToken('verified-proof')}>Verify</button>
  ),
}));

beforeEach(() => {
  state.chat = {
    turns: [],
    connected: true,
    error: null,
    busy: false,
    send: vi.fn().mockResolvedValue(true),
    configured: true,
  };
});
afterEach(cleanup);

const mountChat = (draft = 'A new message') => {
  const props = {
    session: { ...createDemoSession(), draft },
    onChange: vi.fn(),
    onReset: vi.fn(),
    storageAvailable: true,
  };
  const view = render(<DemoChat {...props} />);
  fireEvent.click(screen.getByText('Verify'));
  return { ...view, props };
};

describe('demo composer', () => {
  it('preserves an unsent draft when retrying a failed response', async () => {
    state.chat.turns = [
      { id: 'failed-turn', request: 'The tap leaks', reply: '', status: 'error' },
    ];
    const { props } = mountChat();
    fireEvent.click(screen.getByText('Retry response'));
    await waitFor(() =>
      expect(state.chat.send).toHaveBeenCalledWith('The tap leaks', true, 'verified-proof'),
    );
    expect(props.onChange).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText('Describe a maintenance issue') as HTMLTextAreaElement).value,
    ).toBe('A new message');
  });

  it('clears the draft only when its normal submission succeeds', async () => {
    const { props } = mountChat();
    fireEvent.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(props.onChange).toHaveBeenCalledWith({ draft: '' }));
    expect(state.chat.send).toHaveBeenCalledWith('A new message', false, 'verified-proof');
  });

  it('preserves a new draft typed while the submission is in flight', async () => {
    let complete!: (sent: boolean) => void;
    state.chat.send = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          complete = resolve;
        }),
    );
    const { props, rerender } = mountChat();
    fireEvent.click(screen.getByLabelText('Send message'));
    rerender(<DemoChat {...props} session={{ ...props.session, draft: 'Additional details' }} />);
    complete(true);
    await waitFor(() =>
      expect((screen.getByLabelText('Send message') as HTMLButtonElement).disabled).toBe(true),
    );
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('keeps failed submissions and blocks sends until verification completes', async () => {
    state.chat.send = vi.fn().mockResolvedValue(false);
    const props = {
      session: { ...createDemoSession(), draft: 'The tap leaks' },
      onChange: vi.fn(),
      onReset: vi.fn(),
      storageAvailable: true,
    };
    render(<DemoChat {...props} />);
    expect((screen.getByLabelText('Send message') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Verify'));
    fireEvent.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(state.chat.send).toHaveBeenCalledTimes(1));
    expect(props.onChange).not.toHaveBeenCalled();
  });
});

it('announces the completed answer only after the pending request finishes', () => {
  const { props, container, rerender } = mountChat();
  const live = container.querySelector('[aria-live="polite"][aria-atomic="true"]')!;
  expect(live.textContent).toBe('');
  state.chat.turns = [{ id: 'turn-1', request: 'A leak', reply: '', status: 'thinking' }];
  rerender(<DemoChat {...props} />);
  expect(live.textContent).toBe('');
  state.chat.turns = [{ ...state.chat.turns[0]!, reply: 'Where is the leak?', status: 'ready' }];
  rerender(<DemoChat {...props} />);
  expect(live.textContent).toBe('Austi: Where is the leak?');
});
