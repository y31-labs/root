import { useLocation } from '@tanstack/react-router';
import { Separator } from '@workspace/ui/components/ui/separator';
import { SidebarTrigger } from '@workspace/ui/components/ui/sidebar';

import { useChatDrafts } from '#/providers/chat-drafts-provider';

export function SiteHeader() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { activeChat } = useChatDrafts();

  return (
    <header className='flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)'>
      <div className='flex w-full min-w-0 items-center gap-1 px-4 lg:gap-2 lg:px-6'>
        <SidebarTrigger className='-ml-1' />
        <Separator orientation='vertical' className='mx-2 h-4 data-vertical:self-auto' />
        <span className='min-w-0 truncate text-base font-medium'>
          {pathname === '/settings' ? 'Settings' : (activeChat?.title ?? 'New chat')}
        </span>
      </div>
    </header>
  );
}
