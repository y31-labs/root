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
import type { Model, ModelSpeed } from '#/lib/types';

const effortLabels: Record<string, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Light',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
  max: 'Max',
  ultra: 'Ultra',
};

const formatEffort = (effort: string) => effortLabels[effort] ?? effort;

const hasEffort = (model: Model) => model.effort.options.some((effort) => effort !== 'none');

const getEffort = (model: Model, value: string) =>
  model.effort.options.find((effort) => effort === value);

const getSpeed = (model: Model, value: string) =>
  model.speed.options.find((speed) => speed === value);

interface ModelSelectDropdownProps {
  disabled?: boolean;
  modelSettings: ModelSettingsState;
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
    selectSpeed,
  },
}: ModelSelectDropdownProps) {
  const selectModelEffort = (model: Model, effort: string) => {
    if (settings?.model !== model.model) selectModel(model.model);
    selectEffort(effort);
  };

  const selectModelSpeed = (model: Model, speed: ModelSpeed) => {
    if (settings?.model !== model.model) selectModel(model.model);
    selectSpeed(speed);
  };

  if (loading) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ModelSelectTrigger
            disabled={disabled}
            fast={settings?.speed === 'fast'}
            modelLabel={selectedModel?.displayName ?? 'Unkown'}
            effortLabel={settings && formatEffort(settings.effort)}
          />
        }
      />
      <DropdownMenuContent
        side='top'
        align='start'
        className='w-56 rounded-md border bg-popover shadow-md ring-0 before:hidden'
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>ChatGPT</DropdownMenuLabel>
          {models.map((model) => {
            const isSelected = model.model === settings?.model;
            const effort = isSelected ? settings.effort : model.effort.default;
            const speed = isSelected ? settings.speed : model.speed.default;
            const showEffort = hasEffort(model);
            const showSpeed = model.speed.options.length > 1;

            return (
              <DropdownMenuSub key={model.model}>
                <DropdownMenuSubTrigger
                  className={
                    isSelected
                      ? 'text-foreground'
                      : 'text-muted-foreground focus:text-foreground data-highlighted:text-foreground data-popup-open:text-foreground'
                  }
                  onClick={() => {
                    if (!isSelected) selectModel(model.model);
                  }}
                >
                  <span>{model.displayName}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  side='right'
                  sideOffset={4}
                  align='start'
                  className='w-72 rounded-md border bg-popover shadow-md ring-0 before:hidden'
                >
                  {showEffort && (
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Effort</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={effort}
                        onValueChange={(value) => {
                          const selectedEffort = getEffort(model, value);
                          if (selectedEffort) selectModelEffort(model, selectedEffort);
                        }}
                      >
                        {model.effort.options.map((option) => (
                          <DropdownMenuRadioItem key={option} value={option}>
                            {formatEffort(option)}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                  )}
                  {showSpeed && (
                    <>
                      {showEffort && <DropdownMenuSeparator />}
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Speed</DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={speed}
                          onValueChange={(value) => {
                            const selectedSpeed = getSpeed(model, value);
                            if (selectedSpeed) selectModelSpeed(model, selectedSpeed);
                          }}
                        >
                          {model.speed.options.map((option) => (
                            <DropdownMenuRadioItem key={option} value={option}>
                              <span className='grid'>
                                <span>{option === 'fast' ? 'Fast' : 'Standard'}</span>
                                {option === 'fast' && (
                                  <span className='text-xs text-muted-foreground'>
                                    1.5x faster, higher usage
                                  </span>
                                )}
                              </span>
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuGroup>
                    </>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })}
          {!loading && models.length === 0 && (
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

interface ModelSelectTriggerProps extends ComponentProps<typeof Button> {
  fast: boolean;
  modelLabel: string;
  effortLabel?: string;
}

function ModelSelectTrigger({
  fast,
  modelLabel,
  effortLabel,
  ...props
}: ModelSelectTriggerProps) {
  const accessibleLabel = [modelLabel, effortLabel, fast ? 'Fast mode' : undefined]
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
      {effortLabel && <span className='text-muted-foreground'>{effortLabel}</span>}
    </Button>
  );
}
