import { Link } from '@tanstack/react-router';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@workspace/ui/components/ui/sidebar';
import type { ComponentProps } from 'react';

import { NavMain } from '#/components/navigation/nav-main';
import { NavSettings } from '#/components/navigation/nav-settings';
import { Route as IndexRoute } from '#/routes/index';

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible='offcanvas' {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className='data-[slot=sidebar-menu-button]:p-1.5!'
              render={
                <Link
                  to={IndexRoute.to}
                  onClick={() => setOpenMobile(false)}
                  aria-label='Austi home'
                />
              }
            >
              <img
                src='/austi-logo.svg'
                alt=''
                className='size-5 object-contain invert dark:invert-0'
              />
              <span className='text-base font-semibold'>austi</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
        <NavSettings className='mt-auto' />
      </SidebarContent>
    </Sidebar>
  );
}
