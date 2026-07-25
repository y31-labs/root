import type { PromptInputMessage } from '@workspace/ui/components/ai-elements/prompt-input';

import type { ChatTranscriptPart, CodexApprovalDecision, CodexApprovalRequest } from '#/lib/types';

export type FileAttachment = PromptInputMessage['files'][number] & { id: string };

export interface ChatApproval extends CodexApprovalRequest {
  decision?: CodexApprovalDecision;
  error?: string;
  status: 'pending' | 'submitting' | 'resolved';
}

export interface ChatMessage {
  id: string | number;
  role: 'user' | 'assistant';
  text: string;
  completedAtMs?: number;
  startedAtMs?: number;
  attachments?: FileAttachment[];
  parts?: ChatTranscriptPart[];
  approvals?: ChatApproval[];
  streaming?: boolean;
  error?: string;
}
