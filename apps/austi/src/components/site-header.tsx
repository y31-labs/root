import { useMatches } from '@tanstack/react-router';
import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/ui/avatar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@workspace/ui/components/ui/breadcrumb';
import { Button } from '@workspace/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/ui/dropdown-menu';
import { Separator } from '@workspace/ui/components/ui/separator';
import { SidebarTrigger } from '@workspace/ui/components/ui/sidebar';
import { useWorkosAuth } from '@workspace/web-foundation';
import { Authenticated, Unauthenticated } from 'convex/react';
import { LoaderCircleIcon, LogOutIcon } from 'lucide-react';
import { Fragment } from 'react';

import { useChatDrafts } from '#/providers/chat-drafts-provider';

export interface AuthKitProps {
  signInUrl: string;
  signUpUrl: string;
}

export function SiteHeader({ signInUrl, signUpUrl }: AuthKitProps) {
  const matches = useMatches();
  const { activeChat } = useChatDrafts();
  const segments = matches.flatMap(({ routeId, context: { title } }) => {
    if (!title) return [];
    return [routeId === '/' ? (activeChat?.title ?? title) : title];
  });
  const breadcrumbSegments = segments.length ? segments : ['Austi'];

  return (
    <header className='flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)'>
      <div className='flex w-full min-w-0 items-center gap-1 px-4 lg:gap-2 lg:px-6'>
        <SidebarTrigger className='-ml-1' />
        <Separator orientation='vertical' className='mx-2 h-4 data-vertical:self-auto' />
        <Breadcrumb className='min-w-0'>
          <BreadcrumbList className='flex-nowrap'>
            {breadcrumbSegments.map((segment, index) => {
              const isLastSegment = index === breadcrumbSegments.length - 1;

              return (
                <Fragment key={`${segment}-${index}`}>
                  <BreadcrumbItem className='min-w-0'>
                    {isLastSegment ? (
                      <BreadcrumbPage className='truncate text-base'>{segment}</BreadcrumbPage>
                    ) : (
                      <span className='truncate'>{segment}</span>
                    )}
                  </BreadcrumbItem>
                  {isLastSegment ? null : <BreadcrumbSeparator />}
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
        <div className='ml-auto flex shrink-0 items-center gap-2'>
          <UserActions signInUrl={signInUrl} signUpUrl={signUpUrl} />
        </div>
      </div>
    </header>
  );
}

export function UserActions({ signInUrl, signUpUrl }: AuthKitProps) {
  const { user, signOut, loading } = useWorkosAuth();
  const initials = [user?.firstName, user?.lastName].map((name) => name?.[0] ?? '').join('');

  if (loading)
    return (
      <LoaderCircleIcon
        role='status'
        className='size-4 animate-spin'
        aria-label='Loading account'
      />
    );

  return (
    <>
      <Authenticated>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label='Account menu'
            render={<button type='button' className='rounded-full' />}
          >
            <Avatar>
              <AvatarImage src={user?.profilePictureUrl || ''} alt='' />
              <AvatarFallback>{initials || user?.email?.[0]?.toUpperCase() || '?'}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOutIcon className='size-4' />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Authenticated>
      <Unauthenticated>
        <Button variant='outline' onClick={() => (window.location.href = signInUrl)}>
          Sign in
        </Button>
        <Button onClick={() => (window.location.href = signUpUrl)}>Sign up</Button>
      </Unauthenticated>
    </>
  );
}
