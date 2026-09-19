import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DemoVerification } from '../src/components/DemoVerification';

type WidgetOptions = Parameters<NonNullable<Window['turnstile']>['render']>[1];
const widgets: WidgetOptions[] = [];
const remove = vi.fn();

beforeEach(() => {
  widgets.length = 0;
  remove.mockClear();
  vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', 'public-site-key');
  window.turnstile = {
    render: vi.fn((_element, options) => {
      widgets.push(options);
      return `widget-${widgets.length}`;
    }),
    remove,
  };
});
afterEach(() => {
  cleanup();
  delete window.turnstile;
  vi.unstubAllEnvs();
});

it('binds verification to the demo session and invalidates expired tokens', async () => {
  const onToken = vi.fn();
  render(<DemoVerification sessionToken={'a'.repeat(64)} attempt={0} onToken={onToken} />);
  await waitFor(() => expect(widgets).toHaveLength(1));
  expect(widgets[0]).toMatchObject({
    sitekey: 'public-site-key',
    cData: 'a'.repeat(64),
  });
  act(() => widgets[0]!.callback('proof'));
  expect(onToken).toHaveBeenLastCalledWith('proof');
  act(() => widgets[0]!['expired-callback']());
  expect(onToken).toHaveBeenLastCalledWith(null);
});

it('creates a fresh widget after each attempt and ignores callbacks from the old widget', async () => {
  const onToken = vi.fn();
  const { rerender } = render(
    <DemoVerification sessionToken={'a'.repeat(64)} attempt={0} onToken={onToken} />,
  );
  await waitFor(() => expect(widgets).toHaveLength(1));
  rerender(<DemoVerification sessionToken={'a'.repeat(64)} attempt={1} onToken={onToken} />);
  await waitFor(() => expect(widgets).toHaveLength(2));
  expect(remove).toHaveBeenCalledWith('widget-1');
  onToken.mockClear();
  act(() => widgets[0]!.callback('stale-proof'));
  expect(onToken).not.toHaveBeenCalled();
  act(() => widgets[1]!.callback('fresh-proof'));
  expect(onToken).toHaveBeenCalledWith('fresh-proof');
});

it('offers a retry when the challenge fails', async () => {
  const onToken = vi.fn();
  render(<DemoVerification sessionToken={'a'.repeat(64)} attempt={0} onToken={onToken} />);
  await waitFor(() => expect(widgets).toHaveLength(1));
  act(() => widgets[0]!['error-callback']());
  expect(onToken).toHaveBeenLastCalledWith(null);
  fireEvent.click(screen.getByText('Retry verification'));
  await waitFor(() => expect(widgets).toHaveLength(2));
  expect(remove).toHaveBeenCalledWith('widget-1');
});

it('shows an unavailable state without a site key', () => {
  vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '');
  render(<DemoVerification sessionToken={'a'.repeat(64)} attempt={0} onToken={vi.fn()} />);
  expect(screen.getByText(/Live chat is temporarily unavailable/)).toBeDefined();
  expect(widgets).toHaveLength(0);
});

it('recovers from a blocked script without leaving a permanently rejected loader', async () => {
  delete window.turnstile;
  render(<DemoVerification sessionToken={'a'.repeat(64)} attempt={0} onToken={vi.fn()} />);
  const selector = 'script[src^="https://challenges.cloudflare.com/turnstile/"]';
  await waitFor(() => expect(document.querySelector(selector)).not.toBeNull());
  const script = document.querySelector(selector)!;
  fireEvent.error(script);
  fireEvent.click(await screen.findByText('Retry verification'));
  await waitFor(() => {
    expect(document.querySelector(selector)).not.toBeNull();
    expect(document.querySelector(selector)).not.toBe(script);
  });
  // Finish the retry as well, leaving no pending script timeout in this test.
  fireEvent.error(document.querySelector(selector)!);
  await screen.findByText('Retry verification');
});
