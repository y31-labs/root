import type { Icon } from '@tabler/icons-react';
import type { AnyRoute } from '@tanstack/react-router';

export interface NavItem {
  title: string;
  route: AnyRoute;
  icon: Icon;
}
