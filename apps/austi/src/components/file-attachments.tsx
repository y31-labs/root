import { Button } from '@workspace/ui/components/ui/button';
import { cn } from '@workspace/ui/lib/utils';
import { FileText, X } from 'lucide-react';

import type { FileAttachment } from '#/lib/chat-message';

export type { FileAttachment } from '#/lib/chat-message';

interface FileAttachmentsProps {
  attachments: FileAttachment[];
  className?: string;
  onRemove?: (id: string) => void;
  variant: 'message' | 'inline';
}

const isImage = (attachment: FileAttachment) => attachment.mediaType?.startsWith('image/');

export function FileAttachments({
  attachments,
  className,
  onRemove,
  variant,
}: FileAttachmentsProps) {
  return (
    <div
      className={cn('flex flex-wrap gap-2', variant === 'message' && 'ml-auto w-fit', className)}
    >
      {attachments.map((attachment) => {
        const label = attachment.filename ?? 'Attached file';
        if (variant === 'message' && isImage(attachment) && attachment.url) {
          return (
            <div className='size-24 overflow-hidden rounded-lg' key={attachment.id}>
              <img
                alt={label}
                className='size-full object-cover'
                height={96}
                src={attachment.url}
                width={96}
              />
            </div>
          );
        }

        return (
          <div
            className={cn(
              'flex min-w-0 items-center gap-1.5 rounded-md border px-1.5 text-sm font-medium',
              variant === 'inline' ? 'h-8' : 'h-10 max-w-64 pr-2',
            )}
            key={attachment.id}
          >
            {isImage(attachment) && attachment.url ? (
              <img
                alt={label}
                className='size-5 shrink-0 rounded object-cover'
                height={20}
                src={attachment.url}
                width={20}
              />
            ) : (
              <FileText aria-hidden='true' className='size-4 shrink-0 text-muted-foreground' />
            )}
            <span className='max-w-40 truncate'>{label}</span>
            {onRemove ? (
              <Button
                aria-label={`Remove ${label}`}
                className='size-5 shrink-0 rounded p-0 [&>svg]:size-2.5'
                onClick={() => onRemove(attachment.id)}
                type='button'
                variant='ghost'
              >
                <X />
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
