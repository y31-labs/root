import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@workspace/ui/components/ui/sidebar';
import { CirclePlus, Settings } from 'lucide-react';
import type { ComponentProps } from 'react';

import { useChatDrafts } from '#/providers/chat-drafts-provider';

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { chats, activeChat, newChat, openChat } = useChatDrafts();
  const { setOpenMobile } = useSidebar();

  const handleChat = (id?: string) => {
    if (id) openChat(id);
    else newChat();
    setOpenMobile(false);
    void navigate({ to: '/' });
  };

  return (
    <Sidebar collapsible='offcanvas' {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className='data-[slot=sidebar-menu-button]:p-1.5!'
              render={<Link to='/' onClick={() => setOpenMobile(false)} aria-label='Austi home' />}
            >
              <img
                src='/austi-logo.svg'
                alt=''
                className='size-5 object-contain invert dark:invert-0'
              />
              <span className='text-base font-semibold'>austi</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className='flex flex-col gap-2'>
            <SidebarMenu>
              <SidebarMenuItem className='flex items-center gap-2'>
                <SidebarMenuButton
                  onClick={() => handleChat()}
                  className='min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 active:bg-primary/80'
                >
                  <CirclePlus />
                  <span>New chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {!!chats.length && (
          <SidebarGroup>
            <SidebarGroupLabel>Chats</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {chats.map((chat) => (
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton
                      isActive={pathname === '/' && activeChat?.id === chat.id}
                      onClick={() => handleChat(chat.id)}
                      title={chat.title}
                    >
                      <span>{chat.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === '/settings'}
              render={<Link to='/settings' onClick={() => setOpenMobile(false)} />}
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
