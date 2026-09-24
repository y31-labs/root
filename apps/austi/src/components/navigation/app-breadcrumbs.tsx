import { Link, useMatches, type AnyRouteMatch } from '@tanstack/react-router';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@workspace/ui/components/ui/breadcrumb';
import { Fragment } from 'react';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    breadcrumb?: string | ((match: AnyRouteMatch) => string | undefined);
  }
}

export function AppBreadcrumbs() {
  const matches = useMatches();
  const segments = matches.flatMap((match) => {
    const breadcrumb = match.staticData.breadcrumb;
    const label = typeof breadcrumb === 'function' ? breadcrumb(match) : breadcrumb;
    return label ? [{ id: match.routeId, label, to: match.pathname }] : [];
  });
  const breadcrumbs = segments.length ? segments : [{ id: 'fallback', label: 'Austi', to: '/' }];

  return (
    <Breadcrumb className='min-w-0'>
      <BreadcrumbList className='flex-nowrap'>
        {breadcrumbs.map(({ id, label, to }, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <Fragment key={id}>
              <BreadcrumbItem className='min-w-0'>
                {isLast ? (
                  <BreadcrumbPage className='truncate text-base'>{label}</BreadcrumbPage>
                ) : (
                  <Link to={to} className='truncate hover:text-foreground'>
                    {label}
                  </Link>
                )}
              </BreadcrumbItem>
              {isLast ? null : <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
