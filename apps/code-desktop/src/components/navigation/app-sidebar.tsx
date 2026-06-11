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
import { ListTodo, MessageSquare, Settings } from 'lucide-react';

import { SidebarLinkButton } from '#/components/navigation/sidebar-link-button';
import { localApi } from '#/lib/local-api';
import { desktopLogger, errorCategory } from '#/lib/logging';
import { Route as ChatRoute } from '#/routes/chat';
import { Route as IndexRoute } from '#/routes/index';
import { Route as RunRoute } from '#/routes/runs/$runId';
import { Route as SettingsRoute } from '#/routes/settings';
import { Route as TasksRoute } from '#/routes/tasks';
import { api } from '#convex/_generated/api';

export function AppSidebar() {
  const user = useQuery(api.viewer.get);
  const logout = async () => {
    try {
      await localApi.logout();
      desktopLogger.info('authentication cleared', {
        operation: 'logout',
        status: 'unauthenticated',
      });
    } catch (error) {
      desktopLogger.error('authentication failed', {
        operation: 'logout',
        errorCategory: errorCategory(error),
      });
      throw error;
    }
  };

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
              <SidebarLinkButton title='Chat' route={ChatRoute} fuzzy={false}>
                <MessageSquare />
                <span>Chat</span>
              </SidebarLinkButton>
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
          <SidebarLinkButton title='Settings' route={SettingsRoute} fuzzy={false}>
            <Settings />
            <span>Settings</span>
          </SidebarLinkButton>
          <AccountMenu user={user ?? null} onSignOut={logout} />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
