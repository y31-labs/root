import { Link, useNavigate } from '@tanstack/react-router';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@workspace/ui/components/ui/sidebar';
import { Archive, MessageSquare, Settings, SquarePen } from 'lucide-react';

import { APP_NAME } from '#/lib/app-config';
import { useChatHistory } from '#/providers/chat-history-provider';

export function AppSidebar() {
  const navigate = useNavigate();
  const { activeChatId, archiveChat, chats, historyWarning, newChat, openChat } = useChatHistory();

  const handleNewChat = () => {
    newChat();
    void navigate({ to: '/' });
  };

  const handleOpenChat = (chatId: string) => {
    openChat(chatId);
    void navigate({ to: '/' });
  };

  const handleArchiveChat = (chatId: string, title: string) => {
    if (!window.confirm(`Archive “${title}”?`)) return;
    void archiveChat(chatId).catch(console.error);
  };

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader className='pt-12'>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={APP_NAME} render={<Link to='/' />}>
              <img src='/y31-logo.svg' alt='' aria-hidden='true' className='h-4 w-auto' />
              <span className='font-semibold'>{APP_NAME}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip='New chat' onClick={handleNewChat}>
              <SquarePen />
              <span>New chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className='mx-2 data-horizontal:w-[calc(100%-1rem)]' />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {historyWarning ? (
              <p
                className='px-2 pb-2 text-xs text-warning group-data-[collapsible=icon]:hidden'
                role='status'
                title={historyWarning}
              >
                Chat history recovery notice
              </p>
            ) : null}
            {chats.length > 0 ? (
              <SidebarMenu>
                {chats.map((chat) => (
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton
                      isActive={activeChatId === chat.id}
                      tooltip={chat.title}
                      onClick={() => handleOpenChat(chat.id)}
                    >
                      <MessageSquare />
                      <span>{chat.title}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      aria-label={`Archive ${chat.title}`}
                      showOnHover
                      onClick={(event) => {
                        event.stopPropagation();
                        handleArchiveChat(chat.id, chat.title);
                      }}
                    >
                      <Archive />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            ) : (
              <p className='px-2 py-1 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden'>
                No chats yet
              </p>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip='Settings' render={<Link to='/settings' />}>
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
