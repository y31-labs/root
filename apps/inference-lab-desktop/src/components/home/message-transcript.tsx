import { MessageResponse } from '@workspace/ui/components/ai-elements/message';

import { TaskSequence } from '#/components/home/task-sequence';
import type { ChatTranscriptPart } from '#/lib/types';

type MessageTranscriptPart = Extract<ChatTranscriptPart, { type: 'message' }>;
type TaskTranscriptPart = Exclude<ChatTranscriptPart, MessageTranscriptPart>;
type TranscriptSegment =
  | { type: 'message'; part: MessageTranscriptPart }
  | { type: 'tasks'; id: string; parts: TaskTranscriptPart[] };

export function MessageTranscript({
  parts,
  streaming,
}: {
  parts: ChatTranscriptPart[];
  streaming: boolean;
}) {
  const segments = transcriptSegments(parts);

  return segments.map((segment, index) => {
    const active = streaming && index === segments.length - 1;
    if (segment.type === 'message') {
      return (
        <MessageResponse className='h-auto' isAnimating={active} key={segment.part.id}>
          {segment.part.text}
        </MessageResponse>
      );
    }
    return <TaskSequence active={active} key={segment.id} parts={segment.parts} />;
  });
}

const transcriptSegments = (parts: ChatTranscriptPart[]): TranscriptSegment[] => {
  const segments: TranscriptSegment[] = [];

  for (const part of parts) {
    if (part.type === 'message') {
      if (part.text.trim()) segments.push({ type: 'message', part });
      continue;
    }

    const last = segments.at(-1);
    if (last?.type === 'tasks') {
      last.parts.push(part);
      continue;
    }
    segments.push({ type: 'tasks', id: `tasks-${part.id}`, parts: [part] });
  }

  return segments;
};
