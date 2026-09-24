import { Link, useMatchRoute } from '@tanstack/react-router';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@workspace/ui/components/ui/sidebar';
import { Settings } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';

import type { NavItem } from '#/components/navigation/nav-types';
import { Route as SettingsRoute } from '#/routes/settings';

const items: NavItem[] = [{ title: 'Settings', route: SettingsRoute, icon: Settings }];

export function NavSettings(props: ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const matchRoute = useMatchRoute();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ title, route: { to }, icon: Icon }) => (
            <SidebarMenuItem key={title}>
              <SidebarMenuButton
                render={<Link to={to} onClick={() => setOpenMobile(false)} />}
                isActive={!!matchRoute({ to, fuzzy: true })}
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
