import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
} from '#/components/ui/sidebar';
import { Route as ThreadsIndexRoute } from '#/routes/threads/route';
import { Route as ThreadsIdRoute } from '#/routes/threads/$id';
import { Route as NewThreadRoute } from '#/routes/threads/new';
import { api } from '#convex/_generated/api';
import { IconMessage } from '@tabler/icons-react';
import { Link, useMatchRoute } from '@tanstack/react-router';
import { usePaginatedQuery } from 'convex/react';
import { ChevronDown, HistoryIcon, Plus } from 'lucide-react';

export function NavThread() {
  const matchRoute = useMatchRoute();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Threads</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            isActive={!!matchRoute({ to: NewThreadRoute.to })}
          >
            <Link to={NewThreadRoute.to}>
              <Plus />
              <span>New Thread</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <Collapsible defaultOpen className='group/collapsible'>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={!!matchRoute({ to: ThreadsIndexRoute.to })}
            >
              <Link to={ThreadsIndexRoute.to}>
                <HistoryIcon />
                <span>History</span>
              </Link>
            </SidebarMenuButton>
            <CollapsibleTrigger asChild>
              <SidebarMenuAction>
                <ChevronDown className='transition-transform group-data-[state=open]/collapsible:rotate-180' />
              </SidebarMenuAction>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ThreadHistory />
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      </SidebarMenu>
    </SidebarGroup>
  );
}

const THREAD_HISTORY_LENGTH = 5;

function ThreadHistory() {
  const { results: threads, status } = usePaginatedQuery(
    api.threads.listThreads,
    {},
    { initialNumItems: THREAD_HISTORY_LENGTH },
  );

  if (status === 'LoadingFirstPage') {
    return (
      <SidebarMenuSub>
        <ThreadHistorySkeleton />
      </SidebarMenuSub>
    );
  }

  return (
    <SidebarMenuSub>
      {threads.map(({ _id: id, title }) => (
        <SidebarMenuItem key={id}>
          <SidebarMenuButton asChild>
            <Link to={ThreadsIdRoute.to} params={{ id }}>
              <IconMessage />
              <span>{title || 'Untitled'}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenuSub>
  );
}

function ThreadHistorySkeleton() {
  return Array.from({ length: THREAD_HISTORY_LENGTH }).map((_, index) => (
    <SidebarMenuItem key={index}>
      <SidebarMenuSkeleton showIcon />
    </SidebarMenuItem>
  ));
}

