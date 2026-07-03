import { useNavigate } from '@tanstack/react-router';
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
import { Boxes, ListChecks, Settings, Workflow } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

import { SidebarLinkButton } from '#/components/navigation/sidebar-link-button';
import { getActiveRepositoryId, getActiveTargetId } from '#/lib/active-target';
import { Route as IndexRoute } from '#/routes/index';
import { Route as RepositoryRoute } from '#/routes/repositories/$repositoryId';
import { Route as SessionsRoute } from '#/routes/sessions';
import { Route as SessionRoute } from '#/routes/sessions/$sessionId';
import { Route as SettingsRoute } from '#/routes/settings';

export function AppSidebar() {
  const navigate = useNavigate();

  const openTargetTab = (tab: 'overview' | 'flows') => {
    const repositoryId = getActiveRepositoryId();
    const targetId = repositoryId ? getActiveTargetId(repositoryId) : undefined;
    if (!repositoryId || !targetId) {
      void navigate({ to: '/' });
      return;
    }
    void navigate({
      to: '/repositories/$repositoryId/targets/$targetId',
      params: { repositoryId, targetId },
      search: { tab },
    });
  };

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
                title='Project map'
                route={IndexRoute}
                activeRoutes={[IndexRoute, RepositoryRoute]}
              >
                <Workflow />
                <span>Map</span>
              </SidebarLinkButton>
              <SidebarActionButton
                title='Features'
                icon={Boxes}
                label='Features'
                onClick={() => openTargetTab('overview')}
              />
              <SidebarActionButton
                title='Behaviors'
                icon={Workflow}
                label='Behaviors'
                onClick={() => openTargetTab('flows')}
              />
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

function SidebarActionButton({
  title,
  icon: Icon,
  label,
  onClick,
}: {
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={title} onClick={onClick}>
        <Icon />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
