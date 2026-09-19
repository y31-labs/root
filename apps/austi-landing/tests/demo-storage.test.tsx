import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DemoWorkspace } from '../src/components/DemoWorkspace';
import { HeroExperience } from '../src/components/HeroExperience';
import { createDemoSession, DEMO_STORAGE_KEY, parseDemoSession } from '../src/lib/demo-session';

vi.mock('../src/components/DemoWorkspace', () => ({
  DemoWorkspace: ({ session, onChange, onReset }: ComponentProps<typeof DemoWorkspace>) => (
    <div>
      <p>{session.draft}</p>
      <p>{session.turns.at(-1)?.reply}</p>
      <button onClick={() => onChange({ draft: 'A local draft', approved: true })}>
        Edit demo
      </button>
      <button onClick={onReset}>Reset demo</button>
    </div>
  ),
}));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('removes the old local-storage key and saves interaction state only in sessionStorage', async () => {
  localStorage.setItem(
    DEMO_STORAGE_KEY,
    JSON.stringify({ ...createDemoSession(), draft: 'Old local draft' }),
  );
  const { unmount } = render(<HeroExperience pilotUrl='/pilot' />);
  expect(localStorage.getItem(DEMO_STORAGE_KEY)).toBeNull();
  fireEvent.click(screen.getByText('Start a chat'));
  fireEvent.click(await screen.findByText('Edit demo'));
  await waitFor(() =>
    expect(parseDemoSession(sessionStorage.getItem(DEMO_STORAGE_KEY))?.draft).toBe('A local draft'),
  );
  expect(localStorage.getItem(DEMO_STORAGE_KEY)).toBeNull();
  unmount();
  render(<HeroExperience pilotUrl='/pilot' />);
  fireEvent.click(screen.getByText('Continue chat'));
  expect(await screen.findByText('A local draft')).toBeTruthy();
});

it('restores the transcript from this tab and clears it on a new chat', async () => {
  const saved = {
    ...createDemoSession(),
    approved: true,
    turns: [{ id: 'first', request: 'A leak', reply: 'Which room?', status: 'ready' }],
  };
  sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(saved));
  render(<HeroExperience pilotUrl='/pilot' />);
  fireEvent.click(screen.getByText('Continue chat'));
  expect(await screen.findByText('Which room?')).toBeTruthy();
  fireEvent.click(screen.getByText('Reset demo'));
  await waitFor(() =>
    expect(parseDemoSession(sessionStorage.getItem(DEMO_STORAGE_KEY))?.turns).toEqual([]),
  );
  const reset = parseDemoSession(sessionStorage.getItem(DEMO_STORAGE_KEY))!;
  expect(reset.token).not.toBe(saved.token);
  expect(reset.approved).toBe(true);
});

it('still opens an in-memory demo if browser storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Storage blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage blocked');
  });
  render(<HeroExperience pilotUrl='/pilot' />);
  fireEvent.click(screen.getByText('Start a chat'));
  fireEvent.click(await screen.findByText('Edit demo'));
  expect(screen.getByText('A local draft')).toBeTruthy();
});
