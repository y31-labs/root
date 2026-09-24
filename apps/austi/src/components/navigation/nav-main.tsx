import { Link, useMatchRoute } from '@tanstack/react-router';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@workspace/ui/components/ui/sidebar';
import { Inbox, LayoutDashboard, Wrench } from 'lucide-react';

import type { NavItem } from '#/components/navigation/nav-types';
import { Route as ContractorsRoute } from '#/routes/contractors';
import { Route as IndexRoute } from '#/routes/index';
import { Route as MaintenanceRoute } from '#/routes/maintenance';

const items: NavItem[] = [
  {
    title: 'Dashboard',
    route: IndexRoute,
    icon: LayoutDashboard,
  },
  {
    title: 'Maintenance',
    route: MaintenanceRoute,
    icon: Inbox,
  },
  {
    title: 'Contractors',
    route: ContractorsRoute,
    icon: Wrench,
  },
];

export function NavMain() {
  const matchRoute = useMatchRoute();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupContent className='flex flex-col gap-2'>
        <SidebarMenu>
          {items.map(({ title, route, matchRoutes = [route], icon: Icon }) => (
            <SidebarMenuItem key={title}>
              <SidebarMenuButton
                tooltip={title}
                isActive={matchRoutes.some(({ to }) => !!matchRoute({ to, fuzzy: to !== '/' }))}
                render={<Link to={route.to} onClick={() => setOpenMobile(false)} />}
              >
                <Icon />
                <span>{title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
