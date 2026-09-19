import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@workspace/ui/components/ui/sidebar';
import type { ComponentProps } from 'react';

import { demoTabs } from '../lib/demo-session';
import { DemoChat } from './DemoChat';
import { DemoExamples } from './DemoExamples';
import { DemoIcon } from './DemoIcon';

type Props = ComponentProps<typeof DemoChat>;

export function DemoWorkspace({ session, onChange, onReset, storageAvailable }: Props) {
  const activeTab = session.tab;

  return (
    <section className='demo-workspace' id='austi-demo' aria-label='Austi interactive demo'>
      <SidebarProvider className='demo-shell'>
        <Sidebar collapsible='none' className='demo-sidebar'>
          <SidebarHeader className='demo-sidebar-header'>
            <div className='demo-brand'>
              <img src='/austi-logo.svg' width='22' height='26' alt='' />
              <strong>austi</strong>
              <Badge className='demo-alpha' variant='outline'>
                alpha
              </Badge>
            </div>
            <span className='demo-workspace-name'>Property management</span>
          </SidebarHeader>
          <SidebarContent>
            <nav aria-label='Maintenance desk'>
              <SidebarGroup className='demo-nav-group'>
                <SidebarGroupLabel className='demo-nav-label'>Workspace</SidebarGroupLabel>
                <SidebarMenu className='demo-nav-menu'>
                  {demoTabs.map((tab) => (
                    <SidebarMenuItem key={tab}>
                      <SidebarMenuButton
                        className='demo-nav-button'
                        isActive={activeTab === tab}
                        aria-current={activeTab === tab ? 'page' : undefined}
                        aria-label={tab}
                        aria-controls='demo-content'
                        title={tab}
                        onClick={() => onChange({ tab })}
                      >
                        <DemoIcon name={tab} />
                        <span>{tab}</span>
                        {tab === 'Approvals' && !session.approved && (
                          <span className='demo-nav-count' aria-label='1 sample approval'>
                            1
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            </nav>
          </SidebarContent>
          <SidebarFooter className='demo-sidebar-footer'>
            <span className='demo-guest-avatar' aria-hidden='true'>
              G
            </span>
            <div>
              <strong>Guest workspace</strong>
              <span>Interactive demo</span>
            </div>
          </SidebarFooter>
        </Sidebar>
        <div className='demo-main'>
          <header className='demo-header'>
            <div className='demo-location'>
              <span>Maintenance desk</span>
              <span aria-hidden='true'>/</span>
              <h2 id='demo-view-title'>{activeTab}</h2>
            </div>
            <Badge className='demo-mode' variant='outline'>
              Sample case
            </Badge>
          </header>
          <div
            className='demo-panel'
            id='demo-content'
            role='region'
            aria-labelledby='demo-view-title'
          >
            <DemoExamples
              tab={activeTab}
              approved={session.approved}
              onApprove={() => onChange({ approved: true })}
              onTab={(tab) => onChange({ tab })}
            />
          </div>
          <footer className='demo-footer'>
            <span>Manager workspace · sample workflow</span>
            <Button
              variant='ghost'
              size='xs'
              className='demo-reset-workflow'
              disabled={!session.approved}
              onClick={() => onChange({ approved: false, tab: 'Approvals' })}
            >
              Reset walkthrough
            </Button>
          </footer>
        </div>
      </SidebarProvider>
      <DemoChat
        key={session.token}
        session={session}
        onChange={onChange}
        onReset={onReset}
        storageAvailable={storageAvailable}
      />
    </section>
  );
}
