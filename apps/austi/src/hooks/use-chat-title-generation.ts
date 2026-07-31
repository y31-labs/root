import { useCallback, useRef, useState } from 'react';

import type { LocalApi } from '#/lib/local-api';
import { updateSetMembership } from '#/lib/sets';
import type { ModelSettings } from '#/lib/types';

export interface ChatTitleGenerationRequest {
  chatId: string;
  filenames: string[];
  firstPrompt: string;
  settings?: ModelSettings;
}

interface QueuedChatTitleGeneration extends ChatTitleGenerationRequest {
  resolve: (title: string | undefined) => void;
  started: boolean;
}

export const useChatTitleGeneration = (
  api: Pick<LocalApi, 'generateChatTitle' | 'renameChat'>,
  onTitleGenerated: (chatId: string, title: string) => void,
) => {
  const [generatingTitleChatIds, setGeneratingTitleChatIds] = useState<Set<string>>(
    () => new Set(),
  );
  const queuedTitleGenerations = useRef(new Map<string, QueuedChatTitleGeneration>());

  const finishTitleGeneration = useCallback(
    (request: QueuedChatTitleGeneration, title: string | undefined) => {
      if (queuedTitleGenerations.current.get(request.chatId) !== request) return;
      queuedTitleGenerations.current.delete(request.chatId);
      setGeneratingTitleChatIds((current) => updateSetMembership(current, request.chatId, false));
      request.resolve(title);
    },
    [],
  );

  const generateChatTitle = useCallback(
    (request: ChatTitleGenerationRequest) =>
      new Promise<string | undefined>((resolve) => {
        queuedTitleGenerations.current.get(request.chatId)?.resolve(undefined);
        queuedTitleGenerations.current.set(request.chatId, {
          ...request,
          resolve,
          started: false,
        });
        setGeneratingTitleChatIds((current) => updateSetMembership(current, request.chatId, true));
      }),
    [],
  );

  const runChatTitleGeneration = useCallback(
    (chatId: string) => {
      const queued = queuedTitleGenerations.current.get(chatId);
      if (!queued || queued.started) return;
      queued.started = true;
      void api
        .generateChatTitle(queued.firstPrompt, queued.filenames, queued.settings)
        .then(async (generatedTitle) => {
          if (queuedTitleGenerations.current.get(chatId) !== queued) return undefined;
          const title = typeof generatedTitle === 'string' ? generatedTitle.trim() : '';
          if (!title) return undefined;
          await api.renameChat(chatId, title);
          onTitleGenerated(chatId, title);
          return title;
        })
        .catch((error: unknown) => {
          console.error(error);
          return undefined;
        })
        .then((title) => finishTitleGeneration(queued, title));
    },
    [api, finishTitleGeneration, onTitleGenerated],
  );

  const cancelChatTitleGeneration = useCallback(
    (chatId: string) => {
      const queued = queuedTitleGenerations.current.get(chatId);
      if (queued) finishTitleGeneration(queued, undefined);
    },
    [finishTitleGeneration],
  );

  return {
    cancelChatTitleGeneration,
    generateChatTitle,
    generatingTitleChatIds,
    runChatTitleGeneration,
  };
};
