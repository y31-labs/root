import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/threads/new')({
  component: NewThreadPage,
});

function NewThreadPage() {
  return (
    <div>
      <h1>New Thread</h1>
    </div>
  );
}
