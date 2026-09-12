import { convexTest } from 'convex-test';
import { expect, it } from 'vitest';

import { internal } from '#convex/_generated/api';
import schema from '#convex/schema';

it('the GitHub action repository lookup enforces ownership', async () => {
  const t = convexTest(schema, import.meta.glob('../../convex/**/*.ts'));
  const id = await t.run((ctx) =>
    ctx.db.insert('repos', {
      userId: 'owner',
      publicId: '123',
      owner: 'owner',
      name: 'repository',
      defaultBranch: 'main',
      selected: false,
      visibility: { type: 'public' },
    }),
  );
  expect(await t.query(internal.repos.getForUserInternal, { id, userId: 'owner' })).toMatchObject({
    _id: id,
  });
  expect(await t.query(internal.repos.getForUserInternal, { id, userId: 'other' })).toBeNull();
});
