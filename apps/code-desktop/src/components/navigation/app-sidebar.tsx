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
import { FolderGit2, ListChecks, Settings } from 'lucide-react';

import { SidebarLinkButton } from '#/components/navigation/sidebar-link-button';
import { Route as IndexRoute } from '#/routes/index';
import { Route as RepositoriesRoute } from '#/routes/repositories';
import { Route as RepositoryRoute } from '#/routes/repositories/$repositoryId';
import { Route as SessionsRoute } from '#/routes/sessions';
import { Route as SessionRoute } from '#/routes/sessions/$sessionId';
import { Route as SettingsRoute } from '#/routes/settings';

export function AppSidebar() {
  return (
    <Sidebar collapsible='icon' className='top-10 bottom-0 h-auto'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarLinkButton title='Home' route={IndexRoute} showActiveState={false}>
            <img src='/code-logo.svg' alt='Code' className='size-4 invert' />
            <span>Code</span>
          </SidebarLinkButton>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className='mx-2 data-horizontal:w-[calc(100%-1rem)]' />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarLinkButton
                title='Repositories'
                route={RepositoriesRoute}
                activeRoutes={[RepositoriesRoute, RepositoryRoute]}
              >
                <FolderGit2 />
                <span>Repositories</span>
              </SidebarLinkButton>
              <SidebarLinkButton
                title='Change sessions'
                route={SessionsRoute}
                activeRoutes={[SessionsRoute, SessionRoute]}
              >
                <ListChecks />
                <span>Change sessions</span>
              </SidebarLinkButton>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarLinkButton title='Settings' route={SettingsRoute} fuzzy={false}>
            <Settings />
            <span>Settings</span>
          </SidebarLinkButton>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
