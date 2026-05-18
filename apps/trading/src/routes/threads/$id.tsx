import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/threads/$id')({
  component: ThreadDetailPage,
});

function ThreadDetailPage() {
  return (
    <div>
      <h1>Thread Detail</h1>
    </div>
  );
}
