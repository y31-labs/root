import type { AnyRoute } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  title: string;
  route: AnyRoute;
  icon: LucideIcon;
  matchRoutes?: AnyRoute[];
}
