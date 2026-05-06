import { SearchCommandMenu } from '#/components/search-command-menu';
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb';
import { Button } from '#/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu';
import { Separator } from '#/components/ui/separator';
import { SidebarTrigger } from '#/components/ui/sidebar';
import { Spinner } from '#/components/ui/spinner';
import { APP_TITLE } from '#/lib/const';
import { useMatches } from '@tanstack/react-router';
import type { User } from '@workos/authkit-tanstack-react-start';
import { useAuth } from '@workos/authkit-tanstack-react-start/client';
import { Authenticated, Unauthenticated } from 'convex/react';
import { chain, first } from 'lodash-es';
import { LogOutIcon } from 'lucide-react';
import { Fragment, useMemo } from 'react';

interface AuthKitProps {
  signInUrl: string;
  signUpUrl: string;
}

export function SiteHeader({ signInUrl, signUpUrl }: AuthKitProps) {
  const matches = useMatches();

  const breadcrumbSegments = useMemo(() => {
    const segments = matches.reduce<string[]>(
      (a, { context: { title } }) => (title ? [...a, title] : a),
      [],
    );

    return segments.length ? segments : [APP_TITLE];
  }, [matches]);

  return (
    <header className='sticky top-0 z-50 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)'>
      <div className='flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6'>
        <SidebarTrigger className='-ml-1' />
        <Separator
          orientation='vertical'
          className='mx-2 data-[orientation=vertical]:h-4'
        />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbSegments.map((segment, index) => {
              const isLastSegment = index === breadcrumbSegments.length - 1;

              return (
                <Fragment key={`${segment}-${index}`}>
                  <BreadcrumbItem>
                    {isLastSegment ? (
                      <BreadcrumbPage className='text-base font-medium'>
                        {segment}
                      </BreadcrumbPage>
                    ) : (
                      <span>{segment}</span>
                    )}
                  </BreadcrumbItem>
                  {isLastSegment ? null : <BreadcrumbSeparator />}
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
        <div className='ml-auto flex items-center gap-2'>
          <SearchCommandMenu />
          <UserActions signInUrl={signInUrl} signUpUrl={signUpUrl} />
        </div>
      </div>
    </header>
  );
}

const getInitials = (user: User | null) =>
  chain(user)
    .pick(['firstName', 'lastName'])
    .values()
    .map((v) => first(v ?? ''))
    .join('')
    .value();

export function UserActions({ signInUrl, signUpUrl }: AuthKitProps) {
  const { user, signOut, loading } = useAuth();

  if (loading) {
    return <Spinner />;
  }

  return (
    <>
      <Authenticated>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Avatar>
              <AvatarImage src={user?.profilePictureUrl || ''} />
              <AvatarFallback>{getInitials(user)}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOutIcon className='size-4' />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Authenticated>
      <Unauthenticated>
        <Button
          variant='outline'
          onClick={() => (window.location.href = signInUrl)}
        >
          Sign in
        </Button>
        <Button onClick={() => (window.location.href = signUpUrl)}>
          Sign up
        </Button>
      </Unauthenticated>
    </>
  );
}

