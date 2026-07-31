import type { PromptInputMessage } from '@workspace/ui/components/ai-elements/prompt-input';

import type { ChatTranscriptPart, CodexApprovalDecision, CodexApprovalRequest } from '#/lib/types';

type PromptFile = PromptInputMessage['files'][number];

export type FileAttachment = Omit<PromptFile, 'url'> & {
  id: string;
  storageKey?: string;
  url?: string;
};

export interface ChatApproval extends CodexApprovalRequest {
  decision?: CodexApprovalDecision;
  error?: string;
  status: 'expired' | 'pending' | 'submitting' | 'resolved';
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
