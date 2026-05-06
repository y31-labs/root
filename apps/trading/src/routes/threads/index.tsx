import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/threads/')({
  component: ThreadsListPage,
});

function ThreadsListPage() {
  return (
    <div>
      <h1>Threads List</h1>
    </div>
  );
}
