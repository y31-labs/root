import type { StreamChunk } from '@tanstack/ai/client';
import { useCallback, useRef, useState } from 'react';

import { useLatest } from '#/hooks/use-latest';
import {
  appendActivityDetail,
  appendMessageReference,
  appendReasoningDelta,
  mergeActivityPart,
  transcriptHasFailedError,
} from '#/lib/codex-chat-transcript';
import { finishTurn, updateTurn, updateTurnApproval, type CodexTurn } from '#/lib/codex-chat-turns';
import {
  CODEX_ACTIVITY_DELTA_EVENT,
  CODEX_ACTIVITY_EVENT,
  CODEX_APPROVAL_EVENT,
  CODEX_REASONING_DELTA_EVENT,
  parseCodexTextPartId,
} from '#/lib/codex-stream-translator';
import type { LocalApi } from '#/lib/local-api';
import type {
  CodexActivityCustomEventPayload,
  CodexActivityDeltaCustomEventPayload,
  CodexApprovalCustomEventPayload,
  CodexApprovalDecision,
  CodexApprovalMethod,
  CodexReasoningDeltaCustomEventPayload,
} from '#/lib/types';

export const useCodexTurns = (
  api: Pick<LocalApi, 'resolveCodexApproval'>,
  onRunSettled: () => void,
) => {
  const [turns, setTurns] = useState<CodexTurn[]>([]);
  const activeAssistantMessageId = useRef<string | undefined>(undefined);
  const onRunSettledRef = useLatest(onRunSettled);

  const finishActiveTurn = useCallback(() => {
    const assistantMessageId = activeAssistantMessageId.current;
    if (!assistantMessageId) return;
    setTurns((current) =>
      current.map((turn) =>
        turn.assistantMessageId === assistantMessageId ? finishTurn(turn) : turn,
      ),
    );
    activeAssistantMessageId.current = undefined;
  }, []);

  const recordError = useCallback(
    (error: unknown) => {
      const detail = errorMessage(error);
      const activeId = activeAssistantMessageId.current;
      setTurns((current) => {
        const assistantMessageId =
          activeId ??
          [...current].reverse().find((turn) => turn.completedAtMs === undefined)
            ?.assistantMessageId;
        if (!assistantMessageId) return current;
        return current.map((turn) => {
          if (turn.assistantMessageId !== assistantMessageId) return turn;
          return {
            ...finishTurn(turn),
            parts: transcriptHasFailedError(turn.parts)
              ? turn.parts
              : mergeActivityPart(turn.parts, {
                  id: `request-${assistantMessageId}-error`,
                  kind: 'error',
                  label: detail,
                  status: 'failed',
                }),
          };
        });
      });
      onRunSettledRef.current();
      activeAssistantMessageId.current = undefined;
    },
    [onRunSettledRef],
  );

  const handleChunk = useCallback(
    (chunk: StreamChunk) => {
      if (chunk.type === 'TEXT_MESSAGE_START') {
        const identity = parseCodexTextPartId(chunk.messageId);
        if (!identity) return;
        setTurns((current) =>
          updateTurn(current, identity.assistantMessageId, (turn) => ({
            ...turn,
            parts: appendMessageReference(turn.parts, identity.id, chunk.messageId),
          })),
        );
        return;
      }

      if (chunk.type === 'CUSTOM' && chunk.name === CODEX_REASONING_DELTA_EVENT) {
        const { assistantMessageId, delta, id, summaryIndex } =
          chunk.value as CodexReasoningDeltaCustomEventPayload;
        setTurns((current) =>
          updateTurn(current, assistantMessageId, (turn) => ({
            ...turn,
            parts: appendReasoningDelta(turn.parts, id, summaryIndex, delta),
          })),
        );
        return;
      }

      if (chunk.type === 'CUSTOM' && chunk.name === CODEX_ACTIVITY_EVENT) {
        const { activity, assistantMessageId } = chunk.value as CodexActivityCustomEventPayload;
        setTurns((current) =>
          updateTurn(current, assistantMessageId, (turn) => ({
            ...turn,
            parts: mergeActivityPart(turn.parts, activity),
          })),
        );
        return;
      }

      if (chunk.type === 'CUSTOM' && chunk.name === CODEX_ACTIVITY_DELTA_EVENT) {
        const { assistantMessageId, delta, id } =
          chunk.value as CodexActivityDeltaCustomEventPayload;
        setTurns((current) =>
          updateTurn(current, assistantMessageId, (turn) => ({
            ...turn,
            parts: appendActivityDetail(turn.parts, id, delta),
          })),
        );
        return;
      }

      if (chunk.type === 'CUSTOM' && chunk.name === CODEX_APPROVAL_EVENT) {
        const { approval, assistantMessageId } = chunk.value as CodexApprovalCustomEventPayload;
        setTurns((current) =>
          updateTurn(current, assistantMessageId, (turn) => ({
            ...turn,
            approvals: turn.approvals?.some(
              (candidate) => candidate.requestId === approval.requestId,
            )
              ? turn.approvals
              : [...(turn.approvals ?? []), { ...approval, status: 'pending' }],
          })),
        );
        return;
      }

      if (chunk.type === 'RUN_FINISHED') {
        onRunSettledRef.current();
        finishActiveTurn();
      }
    },
    [finishActiveTurn, onRunSettledRef],
  );

  const resolveApproval = useCallback(
    (requestId: string | number, method: CodexApprovalMethod, decision: CodexApprovalDecision) => {
      setTurns((current) =>
        updateTurnApproval(current, requestId, { error: undefined, status: 'submitting' }),
      );
      void api
        .resolveCodexApproval(requestId, method, decision)
        .then(() =>
          setTurns((current) =>
            updateTurnApproval(current, requestId, { decision, status: 'resolved' }),
          ),
        )
        .catch((error: unknown) =>
          setTurns((current) =>
            updateTurnApproval(current, requestId, {
              error: errorMessage(error),
              status: 'pending',
            }),
          ),
        );
    },
    [api],
  );

  return {
    activeAssistantMessageId,
    finishActiveTurn,
    handleChunk,
    recordError,
    resolveApproval,
    setTurns,
    turns,
  };
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';
