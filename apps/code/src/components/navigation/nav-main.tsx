import type { AnyRoute } from '@tanstack/react-router';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from '@workspace/ui/components/ui/sidebar';
import { SquareCheck } from 'lucide-react';
import type { FC } from 'react';

import { SidebarLinkButton } from '#/components/navigation/sidebar-link-button';
import { Route as TasksRoute } from '#/routes/index';

interface NavItem {
  title: string;
  route: AnyRoute;
  icon: FC;
}

const items: NavItem[] = [
  {
    title: 'Tasks',
    route: TasksRoute,
    icon: SquareCheck,
  },
];

export function NavMain() {
  return (
    <SidebarGroup>
      <SidebarGroupContent className='flex flex-col gap-2'>
        <SidebarMenu>
          {items.map(({ title, route, icon: Icon }) => (
            <SidebarLinkButton key={title} title={title} route={route}>
              <Icon />
            </SidebarLinkButton>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
