import { ConvexQueryClient } from '@convex-dev/react-query';
import { QueryClient } from '@tanstack/react-query';
import { ConvexReactClient } from 'convex/react';

export function createConvexReactQueryStack(getConvexUrl: () => string) {
  const convexClient = new ConvexReactClient(getConvexUrl());
  const convexQueryClient = new ConvexQueryClient(convexClient);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        experimental_prefetchInRender: true,
      },
    },
  });
  convexQueryClient.connect(queryClient);
  return { convexClient, convexQueryClient, queryClient };
}
