import { IconSettings } from '@tabler/icons-react';
import { Link, useMatchRoute } from '@tanstack/react-router';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/ui/components/ui/sidebar';
import type { ComponentPropsWithoutRef } from 'react';

import type { NavItem } from '#/components/navigation/nav-types';
import { Route as SettingsRoute } from '#/routes/settings';

const items: NavItem[] = [
  {
    title: 'Settings',
    route: SettingsRoute,
    icon: IconSettings,
  },
];

export function NavSettings(props: ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const matchRoute = useMatchRoute();

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ title, route: { to }, icon: Icon }) => (
            <SidebarMenuItem key={title}>
              <SidebarMenuButton
                render={<Link to={to} />}
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
