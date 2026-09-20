import type { ComponentType, ReactNode } from 'react';

import type { LocalApi } from '#/lib/local-api';
import { ChatHistoryProvider } from '#/providers/chat-history-provider';
import { LocalApiProvider } from '#/providers/local-api-provider';

export const createCodexChatTestWrapper = (
  api: LocalApi,
  withHistory = false,
  ContentWrapper?: ComponentType<{ children: ReactNode }>,
) => {
  function CodexChatTestWrapper({ children }: { children: ReactNode }) {
    const wrappedChildren = ContentWrapper ? <ContentWrapper>{children}</ContentWrapper> : children;
    const content = withHistory ? (
      <ChatHistoryProvider>{wrappedChildren}</ChatHistoryProvider>
    ) : (
      wrappedChildren
    );
    return <LocalApiProvider api={api}>{content}</LocalApiProvider>;
  }

  return CodexChatTestWrapper;
};
