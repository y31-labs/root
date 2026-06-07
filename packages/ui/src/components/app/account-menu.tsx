import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/ui/dropdown-menu';
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@workspace/ui/components/ui/sidebar';
import { getInitials } from '@workspace/ui/lib/utils';
import { LogOut } from 'lucide-react';

export interface AccountMenuUser {
  firstName: string | null;
  lastName: string | null;
  email?: string | null;
  profilePictureUrl?: string | null;
}

interface AccountMenuProps {
  user: AccountMenuUser | null;
  onSignOut: () => void | Promise<void>;
}

export function AccountMenu({ user, onSignOut }: AccountMenuProps) {
  const { isMobile } = useSidebar();
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              size='lg'
              tooltip='Account'
              className='data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground group-data-[collapsible=icon]:rounded-full'
            />
          }
        >
          <Avatar className='size-8'>
            <AvatarImage
              src={user?.profilePictureUrl ?? undefined}
              alt={name || user?.email || 'Account'}
              className='grayscale'
            />
            <AvatarFallback>{getInitials(user) || 'U'}</AvatarFallback>
          </Avatar>
          <span className='grid min-w-0 flex-1 text-left text-sm leading-tight'>
            <span className='truncate font-medium'>{name || 'Account'}</span>
            {user?.email ? (
              <span className='truncate text-xs text-muted-foreground'>{user.email}</span>
            ) : null}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={isMobile ? 'bottom' : 'right'}
          align='end'
          className='min-w-40'
        >
          <DropdownMenuItem onClick={() => void onSignOut()}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
