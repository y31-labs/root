import type { User } from '@workos/authkit-tanstack-react-start';
import { AccountMenu } from '@workspace/ui/components/app/account-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarSeparator,
} from '@workspace/ui/components/ui/sidebar';
import { useWorkosAuth } from '@workspace/web-foundation';
import { useMutation } from 'convex/react';
import { Settings } from 'lucide-react';
import { useEffect } from 'react';

import { NavMain } from '#/components/navigation/nav-main';
import { SidebarLinkButton } from '#/components/navigation/sidebar-link-button';
import { Route as IndexRoute } from '#/routes/index';
import { Route as SettingsRoute } from '#/routes/settings';
import { api } from '#convex/_generated/api';

interface AppSidebarProps {
  user: User | null;
}

export function AppSidebar({ user }: AppSidebarProps) {
  const { signOut } = useWorkosAuth();
  const syncProfile = useMutation(api.viewer.syncProfile);

  useEffect(() => {
    if (!user) return;

    void syncProfile({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      profilePictureUrl: user.profilePictureUrl,
    });
  }, [syncProfile, user]);

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarLinkButton title='Home' route={IndexRoute} showActiveState={false}>
            <img src='/code-logo.svg' alt='Code' className='size-4 invert' />
          </SidebarLinkButton>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className='mx-2 data-horizontal:w-[calc(100%-1rem)]' />
      <SidebarContent>
        <NavMain />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu className='gap-2'>
          <SidebarLinkButton title='Settings' route={SettingsRoute}>
            <Settings />
          </SidebarLinkButton>
          <AccountMenu user={user} onSignOut={signOut} />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
