import { AccountMenu } from '@workspace/ui/components/app/account-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarSeparator,
} from '@workspace/ui/components/ui/sidebar';
import { useQuery } from 'convex/react';
import { ListTodo, Settings } from 'lucide-react';

import { SidebarLinkButton } from '#/components/navigation/sidebar-link-button';
import { localApi } from '#/lib/local-api';
import { Route as IndexRoute } from '#/routes/index';
import { Route as RunRoute } from '#/routes/runs/$runId';
import { Route as TasksRoute } from '#/routes/tasks';
import { api } from '#convex/_generated/api';

export function AppSidebar() {
  const user = useQuery(api.viewer.get);

  return (
    <Sidebar collapsible='icon' className='top-10 bottom-0 h-auto'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarLinkButton title='Home' route={IndexRoute} showActiveState={false}>
            <img src='/code-logo.svg' alt='Code' className='size-4 invert' />
            <span>Code Desktop</span>
          </SidebarLinkButton>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className='mx-2 data-horizontal:w-[calc(100%-1rem)]' />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarLinkButton
                title='Tasks'
                route={TasksRoute}
                activeRoutes={[TasksRoute, RunRoute]}
              >
                <ListTodo />
                <span>Tasks</span>
              </SidebarLinkButton>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu className='gap-2'>
          <SidebarLinkButton title='Setup' route={IndexRoute} fuzzy={false}>
            <Settings />
            <span>Setup</span>
          </SidebarLinkButton>
          <AccountMenu user={user ?? null} onSignOut={localApi.logout} />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
