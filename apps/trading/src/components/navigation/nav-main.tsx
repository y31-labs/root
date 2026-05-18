import type { NavItem } from '#/components/navigation/nav-types';
import { Button } from '@workspace/ui/components/ui/button';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/ui/components/ui/sidebar';
import { Route as AboutRoute } from '#/routes/about';
import { Route as WatchlistRoute } from '#/routes/watchlist/route';
import { IconBinoculars, IconCirclePlusFilled, IconDashboard, IconMail } from '@tabler/icons-react';
import { Link, useMatchRoute } from '@tanstack/react-router';

const items: NavItem[] = [
  {
    title: 'About',
    route: AboutRoute,
    icon: IconDashboard,
  },
  {
    title: 'Watchlist',
    route: WatchlistRoute,
    icon: IconBinoculars,
  },
];

export function NavMain() {
  const matchRoute = useMatchRoute();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Quick Create"
              className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear"
            >
              <IconCirclePlusFilled />
              <span>Quick Create</span>
            </SidebarMenuButton>
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
            >
              <IconMail />
              <span className="sr-only">Inbox</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map(({ title, route: { to }, icon: Icon }) => (
            <SidebarMenuItem key={title}>
              <SidebarMenuButton
                tooltip={title}
                isActive={!!matchRoute({ to, fuzzy: true })}
                asChild
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
