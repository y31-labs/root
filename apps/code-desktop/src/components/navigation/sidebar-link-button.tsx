import { Link, useMatchRoute, type AnyRoute } from '@tanstack/react-router';
import { SidebarMenuButton, SidebarMenuItem } from '@workspace/ui/components/ui/sidebar';
import type { ReactNode } from 'react';

interface SidebarLinkButtonProps {
  title: string;
  route: AnyRoute;
  children: ReactNode;
  activeRoutes?: AnyRoute[];
  fuzzy?: boolean;
  showActiveState?: boolean;
}

export function SidebarLinkButton({
  title,
  route: { to },
  children,
  activeRoutes,
  fuzzy = true,
  showActiveState = true,
}: SidebarLinkButtonProps) {
  const matchRoute = useMatchRoute();
  const routes = activeRoutes ?? [{ to }];
  const isActive = routes.some((route) => Boolean(matchRoute({ to: route.to, fuzzy })));

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={title}
        isActive={showActiveState && isActive}
        render={<Link to={to} />}
      >
        {children}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
