import { useMatchRoute, useNavigate } from '@tanstack/react-router';
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
import { Spinner } from '@workspace/ui/components/ui/spinner';
import { AppWindow, Archive, Settings, SquarePen } from 'lucide-react';

import { ChatHistoryTitle } from '#/components/navigation/chat-history-title';
import { SidebarLinkButton } from '#/components/navigation/sidebar-link-button';
import { APP_NAME } from '#/lib/app-config';
import { useChatHistory } from '#/providers/chat-history-provider';
import { useGeneratedApps } from '#/providers/generated-apps-provider';
import { Route as GeneratedAppRoute } from '#/routes/apps.$appId';
import { Route as IndexRoute } from '#/routes/index';
import { Route as SettingsRoute } from '#/routes/settings';

export function AppSidebar() {
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const { apps } = useGeneratedApps();
  const isHomeRoute = !!matchRoute({ to: IndexRoute.to, fuzzy: false });
  const {
    activeChatId,
    archiveChat,
    chats,
    generatingTitleChatIds,
    historyWarning,
    newChat,
    openChat,
    runningChatIds,
  } = useChatHistory();

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
          <SidebarLinkButton title={APP_NAME} route={IndexRoute} showActiveState={false}>
            <img src='/y31-logo.svg' alt='' aria-hidden='true' className='h-4 w-auto' />
            <span className='font-semibold'>{APP_NAME}</span>
          </SidebarLinkButton>
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
        {apps.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {apps.map((app) => (
                  <SidebarLinkButton
                    key={app.id}
                    title={app.title}
                    route={GeneratedAppRoute}
                    params={{ appId: app.id }}
                  >
                    <AppWindow />
                    <span>{app.title}</span>
                  </SidebarLinkButton>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
        <SidebarSeparator className='mx-2 data-horizontal:w-[calc(100%-1rem)]' />
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
                      aria-label={chat.title}
                      className='data-active:font-normal md:pr-2! md:group-focus-within/menu-item:pr-8! md:group-hover/menu-item:pr-8!'
                      isActive={isHomeRoute && activeChatId === chat.id}
                      tooltip={chat.title}
                      onClick={() => handleOpenChat(chat.id)}
                    >
                      <ChatHistoryTitle
                        generating={generatingTitleChatIds.has(chat.id)}
                        title={chat.title}
                      />
                      {runningChatIds.has(chat.id) ? (
                        <Spinner className='size-3 text-muted-foreground' />
                      ) : null}
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      aria-label={`Archive ${chat.title}`}
                      className='text-muted-foreground peer-hover/menu-button:text-muted-foreground peer-data-active/menu-button:text-muted-foreground hover:text-foreground'
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
          <SidebarLinkButton title='Settings' route={SettingsRoute} fuzzy={false}>
            <Settings />
            <span>Settings</span>
          </SidebarLinkButton>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
