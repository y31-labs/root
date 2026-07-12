import { afterEach, expect, test, vi } from 'vitest';

import { runViewTransition } from '#/lib/view-transition';

afterEach(() => {
  vi.unstubAllGlobals();
});

test('runs the update without browser view transition support', () => {
  vi.stubGlobal('document', {});

  let didUpdate = false;

  runViewTransition(() => {
    didUpdate = true;
  });

  expect(didUpdate).toBe(true);
});

test('uses startViewTransition when it is available', () => {
  const startViewTransition = vi.fn((update: () => void) => update());

  vi.stubGlobal('document', { startViewTransition });

  let didUpdate = false;

  runViewTransition(() => {
    didUpdate = true;
  });

  expect(startViewTransition).toHaveBeenCalledTimes(1);
  expect(didUpdate).toBe(true);
});
