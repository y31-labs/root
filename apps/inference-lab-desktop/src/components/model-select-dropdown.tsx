import { Button } from '@workspace/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@workspace/ui/components/ui/dropdown-menu';
import { ChevronDown, Zap } from 'lucide-react';
import { type ComponentProps, useState } from 'react';

interface CodexSettings {
  model: string;
  effort: string;
  speed: string;
}

interface Menu {
  id: keyof CodexSettings;
  label: string;
  options: string[];
}

type ModelSelectTriggerProps = ComponentProps<typeof Button> & {
  settings: CodexSettings;
};

const menus: Menu[] = [
  { id: 'model', label: 'Model', options: ['5.6 Sol', '5.6 Terra', '5.6 Luna'] },
  {
    id: 'effort',
    label: 'Effort',
    options: ['Light', 'Medium', 'High', 'Extra High', 'Ultra'],
  },
  { id: 'speed', label: 'Speed', options: ['Standard', 'Fast'] },
];

function ModelSelectTrigger({ settings, ...props }: ModelSelectTriggerProps) {
  return (
    <Button
      {...props}
      type='button'
      variant='ghost'
      size='sm'
      className={
        'relative isolate gap-0 rounded-full before:pointer-events-none before:absolute before:inset-y-0 before:right-[calc(100%-1rem)] before:-z-10 before:w-0 before:rounded-l-full before:bg-muted before:content-[""] before:transition-[width] before:duration-150 before:ease-[cubic-bezier(0.25,0.1,0.25,1)] data-popup-open:bg-muted! data-popup-open:before:w-[max(0px,calc(15rem-100%))] data-popup-open:[&>span]:translate-x-[calc(50%-5.25rem)] motion-reduce:before:transition-none'
      }
    >
      <span className='inline-flex items-center gap-1 transition-transform duration-150 ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none'>
        {settings.speed === 'Fast' ? (
          <Zap
            aria-label='Fast mode enabled'
            className='size-3 fill-current text-muted-foreground'
          />
        ) : null}
        <span>{settings.model}</span>
        <span className='text-muted-foreground'>{settings.effort}</span>
      </span>
      <ChevronDown className='ml-1.5 size-3 text-muted-foreground' />
    </Button>
  );
}

export function ModelSelectDropdown() {
  const [settings, setSettings] = useState<CodexSettings>({
    model: '5.6 Sol',
    effort: 'Extra High',
    speed: 'Standard',
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<ModelSelectTrigger settings={settings} />} />
      <DropdownMenuContent
        side='top'
        align='end'
        className={'w-56 rounded-md border bg-popover shadow-md ring-0 before:hidden'}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Codex</DropdownMenuLabel>
          {menus.map((menu) => (
            <DropdownMenuSub key={menu.id}>
              <DropdownMenuSubTrigger className='grid grid-cols-[1fr_auto_auto] gap-2'>
                <span>{menu.label}</span>
                <span className='text-muted-foreground'>{settings[menu.id]}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                side='right'
                sideOffset={4}
                align='start'
                className={'w-56 rounded-md border bg-popover shadow-md ring-0 before:hidden'}
              >
                <DropdownMenuRadioGroup
                  value={settings[menu.id]}
                  onValueChange={(value) =>
                    setSettings((currentSettings) => ({
                      ...currentSettings,
                      [menu.id]: value,
                    }))
                  }
                >
                  {menu.options.map((option) => (
                    <DropdownMenuRadioItem key={option} value={option}>
                      {option}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>API</DropdownMenuLabel>
          <DropdownMenuItem disabled>Coming soon</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
