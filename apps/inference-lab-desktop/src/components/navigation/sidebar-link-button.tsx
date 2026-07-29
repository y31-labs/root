import { Link, useMatchRoute, type AnyRoute } from '@tanstack/react-router';
import { SidebarMenuButton, SidebarMenuItem } from '@workspace/ui/components/ui/sidebar';
import type { ReactNode } from 'react';

interface SidebarLinkButtonProps<TRoute extends AnyRoute> {
  title: string;
  route: TRoute;
  children: ReactNode;
  fuzzy?: boolean;
  params?: TRoute['types']['allParams'];
  showActiveState?: boolean;
}

export function SidebarLinkButton<TRoute extends AnyRoute>({
  title,
  route: { to },
  children,
  fuzzy = true,
  params,
  showActiveState = true,
}: SidebarLinkButtonProps<TRoute>) {
  const matchRoute = useMatchRoute();
  const isActive = params ? !!matchRoute({ to, params, fuzzy }) : !!matchRoute({ to, fuzzy });
  const link = params ? <Link to={to} params={params} /> : <Link to={to} />;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={title} isActive={showActiveState && isActive} render={link}>
        {children}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
