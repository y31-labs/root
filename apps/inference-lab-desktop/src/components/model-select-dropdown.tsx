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
import { Zap } from 'lucide-react';
import type { ComponentProps } from 'react';

import type { ModelSettingsState } from '#/hooks/use-model-settings';

const STANDARD_SERVICE_TIER = '__standard__';

interface ModelSelectDropdownProps {
  disabled?: boolean;
  modelSettings: ModelSettingsState;
}

interface MenuOption {
  description?: string;
  label: string;
  value: string;
}

interface Menu {
  id: 'model' | 'effort' | 'speed';
  label: string;
  options: MenuOption[];
  selectedLabel: string;
  value: string;
  onValueChange: (value: string) => void;
}

type ModelSelectTriggerProps = ComponentProps<typeof Button> & {
  fast: boolean;
  modelLabel: string;
  reasoningLabel?: string;
};

const effortLabels: Record<string, string> = {
  low: 'Light',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
  max: 'Max',
  ultra: 'Ultra',
};

const formatEffort = (effort: string) => effortLabels[effort] ?? effort;

function ModelSelectTrigger({
  fast,
  modelLabel,
  reasoningLabel,
  ...props
}: ModelSelectTriggerProps) {
  const accessibleLabel = [modelLabel, reasoningLabel, fast ? 'Fast mode' : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <Button
      {...props}
      aria-label={accessibleLabel}
      type='button'
      variant='ghost'
      size='sm'
      className={
        'grow-0 justify-center rounded-full transition-[flex-grow,background-color] duration-150 ease-[cubic-bezier(0.25,0.1,0.25,1)] data-popup-open:grow data-popup-open:bg-muted! motion-reduce:transition-none'
      }
    >
      {fast && <Zap aria-label='Fast mode' className='fill-current text-foreground' />}
      <span className='text-foreground'>{modelLabel}</span>
      {reasoningLabel && <span className='text-muted-foreground'>{reasoningLabel}</span>}
    </Button>
  );
}

export function ModelSelectDropdown({
  disabled,
  modelSettings: {
    catalogError,
    loading,
    models,
    selectedModel,
    settings,
    selectEffort,
    selectModel,
    selectServiceTier,
  },
}: ModelSelectDropdownProps) {
  const selectedServiceTier = selectedModel?.serviceTiers.find(
    (tier) => tier.id === settings?.serviceTier,
  );
  const menus: Menu[] =
    selectedModel && settings
      ? [
          {
            id: 'model',
            label: 'Model',
            options: models.map((model) => ({ label: model.displayName, value: model.model })),
            selectedLabel: selectedModel.displayName,
            value: selectedModel.model,
            onValueChange: selectModel,
          },
          {
            id: 'effort',
            label: 'Effort',
            options: selectedModel.supportedReasoningEfforts.map((option) => ({
              label: formatEffort(option.reasoningEffort),
              value: option.reasoningEffort,
            })),
            selectedLabel: formatEffort(settings.effort),
            value: settings.effort,
            onValueChange: selectEffort,
          },
          {
            id: 'speed',
            label: 'Speed',
            options: [
              { label: 'Standard', value: STANDARD_SERVICE_TIER },
              ...selectedModel.serviceTiers.map((tier) => ({
                description: tier.name === 'Fast' ? '1.5x faster, higher usage' : undefined,
                label: tier.name,
                value: tier.id,
              })),
            ],
            selectedLabel: selectedServiceTier?.name ?? 'Standard',
            value: settings.serviceTier ?? STANDARD_SERVICE_TIER,
            onValueChange: (serviceTier) =>
              selectServiceTier(serviceTier === STANDARD_SERVICE_TIER ? null : serviceTier),
          },
        ]
      : [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ModelSelectTrigger
            disabled={disabled}
            fast={selectedServiceTier?.name === 'Fast'}
            modelLabel={selectedModel?.displayName ?? (loading ? 'Loading models' : 'Models')}
            reasoningLabel={settings ? formatEffort(settings.effort) : undefined}
          />
        }
      />
      <DropdownMenuContent
        side='top'
        align='start'
        className='w-56 rounded-md border bg-popover shadow-md ring-0 before:hidden'
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Models</DropdownMenuLabel>
          {menus.map((menu) => (
            <DropdownMenuSub key={menu.id}>
              <DropdownMenuSubTrigger className='grid grid-cols-[1fr_auto_auto] gap-2'>
                <span>{menu.label}</span>
                <span className='text-muted-foreground'>{menu.selectedLabel}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                side='right'
                sideOffset={4}
                align='start'
                className='w-56 rounded-md border bg-popover shadow-md ring-0 before:hidden'
              >
                <DropdownMenuRadioGroup value={menu.value} onValueChange={menu.onValueChange}>
                  {menu.options.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      <span className='grid'>
                        <span>{option.label}</span>
                        {option.description && (
                          <span className='text-xs text-muted-foreground'>
                            {option.description}
                          </span>
                        )}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
          {!loading && menus.length === 0 && (
            <DropdownMenuItem disabled>{catalogError ?? 'No models available'}</DropdownMenuItem>
          )}
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
