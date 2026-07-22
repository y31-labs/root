import { Link, useNavigate } from '@tanstack/react-router';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@workspace/ui/components/ui/sidebar';
import { Plus, Settings } from 'lucide-react';

import { APP_NAME } from '#/lib/app-config';

export function AppSidebar() {
  const navigate = useNavigate();

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader className='pt-12'>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={APP_NAME} render={<Link to='/' />}>
              <img src='/y31-logo.svg' alt='' aria-hidden='true' className='h-4 w-auto' />
              <span className='font-semibold'>{APP_NAME}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className='mx-2 data-horizontal:w-[calc(100%-1rem)]' />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip='New chat' onClick={() => void navigate({ to: '/' })}>
                  <Plus />
                  <span>New chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip='Settings' render={<Link to='/settings' />}>
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
