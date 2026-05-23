import { IconInnerShadowTop } from '@tabler/icons-react';
import { NavMain } from '#/components/navigation/nav-main';
import { NavSettings } from '#/components/navigation/nav-settings';
import { NavThread } from '#/components/navigation/nav-thread';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/ui/components/ui/sidebar';
import { Route as IndexRoute } from '#/routes/index';
import { APP_TITLE } from '#/lib/const';
import { Link } from '@tanstack/react-router';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible='offcanvas' {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className='data-[slot=sidebar-menu-button]:!p-1.5'>
              <Link to={IndexRoute.to}>
                <IconInnerShadowTop className='!size-5' />
                <span className='text-base font-semibold'>{APP_TITLE}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
        <NavThread />
        <NavSettings className='mt-auto' />
      </SidebarContent>
    </Sidebar>
  );
}

