import { api } from '#convex/_generated/api';
import { convexQuery } from '@convex-dev/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@workspace/ui/components/ui/button';
import { useMutation } from 'convex/react';
import { useState } from 'react';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const queryClient = useQueryClient();
  const { data: repos = [] } = useQuery(convexQuery(api.repos.list, {}));
  const createRepo = useMutation(api.repos.create);
  const [owner, setOwner] = useState('');
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('main');

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
        <p className="text-muted-foreground text-sm">
          Pick a repository, then open its ticket list.
        </p>
      </div>

      <section className="bg-card text-card-foreground flex flex-col gap-4 rounded-lg border border-border p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-medium">Add allowlisted repo</h2>
          <p className="text-muted-foreground text-sm">
            GitHub wiring comes later; this is the MVP allowlist record.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <label className="grid gap-1 text-sm font-medium" htmlFor="owner">
            Owner
            <input
              id="owner"
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="acme"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="name">
            Repo name
            <input
              id="name"
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="web-app"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="branch">
            Default branch
            <input
              id="branch"
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </label>
          <Button
            type="button"
            onClick={async () => {
              await createRepo({
                owner: owner.trim(),
                name: name.trim(),
                defaultBranch: branch.trim() || 'main',
              });
              await queryClient.invalidateQueries(convexQuery(api.repos.list, {}));
              setOwner('');
              setName('');
            }}
            disabled={!owner.trim() || !name.trim()}
          >
            Save repo
          </Button>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Repos</h2>
        {repos.length === 0 ? (
          <p className="text-muted-foreground text-sm">No repos yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {repos.map((repo) => (
              <li key={repo._id}>
                <Link
                  to="/tickets"
                  search={{ repoId: repo._id }}
                  className="text-primary font-medium underline-offset-4 hover:underline"
                >
                  {repo.owner}/{repo.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
