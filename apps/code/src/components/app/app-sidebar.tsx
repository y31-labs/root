import { Link } from '@tanstack/react-router';
import type { User } from '@workos/authkit-tanstack-react-start';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@workspace/ui/components/ui/avatar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@workspace/ui/components/ui/sidebar';
import { getInitials } from '@workspace/ui/lib/utils';
import { SquareDashed } from 'lucide-react';

import { NavMain } from '#/components/navigation/nav-main';
import { Route as IndexRoute } from '#/routes/index';

interface AppSidebarProps {
  user: User | null;
}

export function AppSidebar({ user }: AppSidebarProps) {
  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip='Home'>
              <Link to={IndexRoute.to}>
                <SquareDashed />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className='mx-2 data-horizontal:w-[calc(100%-1rem)]' />
      <SidebarContent>
        <NavMain />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <Avatar>
              <AvatarImage
                src={user?.profilePictureUrl ?? undefined}
                alt={user?.firstName ?? undefined}
                className='grayscale'
              />
              <AvatarFallback>{getInitials(user)}</AvatarFallback>
            </Avatar>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

