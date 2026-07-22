// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChat } from '#/hooks/use-chat';
import { createLocalApi } from '#/lib/local-api';
import type { ChatStreamEvent } from '#/lib/types';
import { LocalApiProvider } from '#/providers/local-api-provider';

afterEach(cleanup);

describe('useChat', () => {
  it('owns streamed chat state and delegates the request to the local API', async () => {
    let emit: ((event: ChatStreamEvent) => void) | undefined;
    let resolveRequest: (result: unknown) => void = () => undefined;
    const request = new Promise<unknown>((resolve) => {
      resolveRequest = resolve;
    });
    const invoke = vi.fn(() => request);
    const api = createLocalApi(invoke, (onMessage) => {
      emit = onMessage as (event: ChatStreamEvent) => void;
      return { id: 'channel-1' };
    });

    function Wrapper({ children }: { children: ReactNode }) {
      return <LocalApiProvider api={api}>{children}</LocalApiProvider>;
    }

    const { result } = renderHook(() => useChat({ workingDirectory: '/Users/example/project' }), {
      wrapper: Wrapper,
    });

    act(() =>
      result.current.submitPrompt({
        files: [
          {
            filename: 'brief.pdf',
            mediaType: 'application/pdf',
            type: 'file',
            url: 'data:application/pdf;base64,ZmlsZQ==',
          },
        ],
        text: '  Build an intake flow  ',
      }),
    );

    expect(result.current.pending).toBe(true);
    expect(result.current.messages).toEqual([
      {
        attachments: [
          {
            filename: 'brief.pdf',
            id: 'message-1-file-0',
            mediaType: 'application/pdf',
            type: 'file',
            url: 'data:application/pdf;base64,ZmlsZQ==',
          },
        ],
        id: 1,
        role: 'user',
        text: 'Build an intake flow',
      },
      { id: 2, role: 'assistant', streaming: true, text: '' },
    ]);

    act(() => emit?.({ type: 'delta', text: 'Done' }));
    expect(result.current.messages[1]).toMatchObject({ streaming: true, text: 'Done' });

    act(() => resolveRequest({ threadId: 'thread-1' }));
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(result.current.messages[1]).toMatchObject({ streaming: false, text: 'Done' });
    expect(invoke).toHaveBeenCalledWith('stream_codex_text', {
      input: {
        attachments: [
          {
            dataUrl: 'data:application/pdf;base64,ZmlsZQ==',
            filename: 'brief.pdf',
            mediaType: 'application/pdf',
          },
        ],
        prompt: 'Build an intake flow',
        workingDirectory: '/Users/example/project',
      },
      onEvent: { id: 'channel-1' },
    });
  });
});
