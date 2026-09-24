import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/ui/native-select';

import { useTheme, type Theme } from '#/providers/theme-provider';

const themes = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] satisfies { value: Theme; label: string }[];

interface ThemeSelectProps {
  id?: string;
}

export function ThemeSelect({ id }: ThemeSelectProps) {
  const { theme, setTheme } = useTheme();

  return (
    <NativeSelect id={id} value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
      {themes.map(({ label, value }) => (
        <NativeSelectOption key={value} value={value}>
          {label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
