import { PromptInputButton } from '@workspace/ui/components/ai-elements/prompt-input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/ui/dropdown-menu';
import { Eye, FolderPen, ShieldAlert } from 'lucide-react';

import type { PermissionMode } from '#/lib/types';

const dangerTextStyle = { color: 'var(--danger)' };

const permissionOptions: Record<
  PermissionMode,
  {
    description: string;
    icon: typeof Eye;
    label: string;
  }
> = {
  'read-only': {
    description: 'Inspect files without making changes',
    icon: Eye,
    label: 'Read only',
  },
  'workspace-write': {
    description: 'Edit the working folder and ask for broader access',
    icon: FolderPen,
    label: 'Workspace',
  },
  'danger-full-access': {
    description: 'Use the system and network without approval',
    icon: ShieldAlert,
    label: 'Full access',
  },
};

interface PermissionSelectDropdownProps {
  disabled?: boolean;
  permissionMode: PermissionMode;
  onPermissionModeChange: (permissionMode: PermissionMode) => void;
}

export function PermissionSelectDropdown({
  disabled,
  permissionMode,
  onPermissionModeChange,
}: PermissionSelectDropdownProps) {
  const selected = permissionOptions[permissionMode];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <PromptInputButton
            aria-label={`Permissions: ${selected.label}`}
            className='rounded-full dark:aria-expanded:bg-muted/50'
            disabled={disabled}
            type='button'
            variant='ghost'
          >
            <selected.icon
              stroke={permissionMode === 'danger-full-access' ? 'var(--danger)' : undefined}
              style={permissionMode === 'danger-full-access' ? dangerTextStyle : undefined}
            />
          </PromptInputButton>
        }
      />
      <DropdownMenuContent
        align='start'
        className='w-max rounded-md border bg-popover shadow-md ring-0 before:hidden'
        finalFocus={(interactionType) => interactionType === 'keyboard'}
        side='top'
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Permissions</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={permissionMode}
            onValueChange={(value) => onPermissionModeChange(value as PermissionMode)}
          >
            {Object.entries(permissionOptions).map(
              ([permission, { icon: Icon, label, description }]) => {
                const style = permission === 'danger-full-access' ? dangerTextStyle : undefined;

                return (
                  <DropdownMenuRadioItem closeOnClick key={permission} value={permission}>
                    <Icon
                      stroke={permission === 'danger-full-access' ? 'var(--danger)' : undefined}
                      style={style}
                    />
                    <span className='grid'>
                      <span style={style}>{label}</span>
                      <span className='whitespace-nowrap text-xs text-muted-foreground'>
                        {description}
                      </span>
                    </span>
                  </DropdownMenuRadioItem>
                );
              },
            )}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
