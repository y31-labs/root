import {
  PromptInputHeader,
  usePromptInputAttachments,
} from '@workspace/ui/components/ai-elements/prompt-input';

import { FileAttachments } from '#/components/file-attachments';

export function PromptAttachments() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;

  return (
    <PromptInputHeader className='px-3 pt-3'>
      <FileAttachments
        attachments={attachments.files}
        onRemove={attachments.remove}
        variant='inline'
      />
    </PromptInputHeader>
  );
}
