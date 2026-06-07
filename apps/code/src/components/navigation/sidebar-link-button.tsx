import { Link, useMatchRoute, type AnyRoute } from '@tanstack/react-router';
import { SidebarMenuButton, SidebarMenuItem } from '@workspace/ui/components/ui/sidebar';
import type { ReactNode } from 'react';

interface SidebarLinkButtonProps {
  title: string;
  route: AnyRoute;
  children: ReactNode;
  fuzzy?: boolean;
  showActiveState?: boolean;
}

export function SidebarLinkButton({
  title,
  route: { to },
  children,
  fuzzy = true,
  showActiveState = true,
}: SidebarLinkButtonProps) {
  const matchRoute = useMatchRoute();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={title}
        isActive={showActiveState && !!matchRoute({ to, fuzzy })}
        render={<Link to={to} />}
      >
        {children}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
