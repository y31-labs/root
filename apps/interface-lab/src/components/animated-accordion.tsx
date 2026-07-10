import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/ui/collapsible';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export type AnimatedAccordionItem = {
  content: string;
  icon: LucideIcon;
  title: string;
  value: string;
};

export function AnimatedAccordion({ items }: { items: AnimatedAccordionItem[] }) {
  const [openItem, setOpenItem] = useState<string | null>(null);

  return (
    <div className='divide-y divide-border border-y border-border' data-testid='faq-accordion'>
      {items.map(({ content, icon: Icon, title, value }) => {
        const isOpen = openItem === value;

        return (
          <Collapsible
            key={value}
            open={isOpen}
            onOpenChange={(open) => setOpenItem(open ? value : null)}
          >
            <CollapsibleTrigger className='group flex w-full items-center gap-3 py-5 text-left font-medium outline-none transition-colors hover:text-foreground/75 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'>
              <span className='flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted/30 text-muted-foreground transition-colors duration-300 group-hover:border-foreground/25 group-hover:text-foreground'>
                <Icon className='size-4' />
              </span>
              <span className='flex-1'>{title}</span>
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out ${
                  isOpen ? 'rotate-180 text-foreground' : ''
                }`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className='y31-accordion-panel'>
              <div className='pb-5 pl-11 pr-8'>
                <p className='text-muted-foreground max-w-2xl text-sm leading-6'>{content}</p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
