import { IconSettings } from '@tabler/icons-react';
import { Route as SettingsRoute } from '#/routes/settings';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '#/components/ui/sidebar';
import { Link, useMatchRoute } from '@tanstack/react-router';
import type { NavItem } from '#/components/navigation/nav-types';
import type { ComponentPropsWithoutRef } from 'react';

const items: NavItem[] = [
  {
    title: 'Settings',
    route: SettingsRoute,
    icon: IconSettings,
  },
];

export function NavSettings(
  props: ComponentPropsWithoutRef<typeof SidebarGroup>,
) {
  const matchRoute = useMatchRoute();

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ title, route: { to }, icon: Icon }) => (
            <SidebarMenuItem key={title}>
              <SidebarMenuButton
                asChild
                isActive={!!matchRoute({ to, fuzzy: true })}
              >
                <Link to={to}>
                  <Icon />
                  <span>{title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

