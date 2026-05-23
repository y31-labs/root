import { Route as IndexRoute } from '#/routes/index';
import { Link, useMatchRoute, type AnyRoute } from '@tanstack/react-router';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/ui/components/ui/sidebar';
import { File } from 'lucide-react';
import type { FC } from 'react';

interface NavItem {
  title: string;
  route: AnyRoute;
  icon: FC;
}

const items: NavItem[] = [
  {
    title: 'Inbox',
    route: IndexRoute,
    icon: File,
  },
];

export function NavMain() {
  const matchRoute = useMatchRoute();

  return (
    <SidebarGroup>
      <SidebarGroupContent className='flex flex-col gap-2'>
        <SidebarMenu>
          {items.map(({ title, route: { to }, icon: Icon }) => (
            <SidebarMenuItem key={title}>
              <SidebarMenuButton
                tooltip={title}
                isActive={!!matchRoute({ to, fuzzy: true })}
              >
                <Link to={to}>
                  <Icon />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
