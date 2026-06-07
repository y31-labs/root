import { convexQuery } from '@convex-dev/react-query';

import { api } from '#convex/_generated/api';
import type { Id } from '#convex/_generated/dataModel';

export const desktopQueries = {
  repos: convexQuery(api.repos.list, {}),
  tickets: convexQuery(api.tickets.list, {}),
  run: (id: Id<'runs'>) => convexQuery(api.runs.get, { id }),
};
