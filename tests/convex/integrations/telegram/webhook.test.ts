import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { TelegramUpdate } from '#convex/integrations/telegram/types';
import schema from '#convex/schema';

const modules = import.meta.glob('../../../../convex/**/*.ts');

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('authenticates webhooks and acknowledges a persisted update', async () => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '456:fake_token');
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'test-secret');
  const t = convexTest(schema, modules);
  const update: TelegramUpdate = {
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: 123, type: 'private' },
      from: { id: 123, is_bot: false },
      text: 'Hello',
    },
  };
  const body = JSON.stringify(update);
  expect((await t.fetch('/telegram/webhook', { method: 'POST', body })).status).toBe(401);
  const request = {
    method: 'POST',
    body,
    headers: { 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' },
  };
  expect((await t.fetch('/telegram/webhook', request)).status).toBe(200);
  expect((await t.fetch('/telegram/webhook', request)).status).toBe(200);
  expect(await t.run((ctx) => ctx.db.query('messages').collect())).toHaveLength(1);
  expect((await t.fetch('/telegram/webhook', { ...request, body: '{' })).status).toBe(400);
});

it('requires configuration and rejects an incorrect secret before parsing', async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'test-secret');
  expect((await t.fetch('/telegram/webhook', { method: 'POST', body: '{' })).status).toBe(503);
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '456:token');
  expect(
    (
      await t.fetch('/telegram/webhook', {
        method: 'POST',
        headers: { 'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret' },
        body: '{',
      })
    ).status,
  ).toBe(401);
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', '');
  expect((await t.fetch('/telegram/webhook', { method: 'POST', body: '{' })).status).toBe(503);
});

it('acknowledges ignored updates without persisting a message', async () => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '456:token');
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'test-secret');
  const t = convexTest(schema, modules);
  const update: TelegramUpdate = { update_id: 1 };
  expect(
    (
      await t.fetch('/telegram/webhook', {
        method: 'POST',
        headers: { 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' },
        body: JSON.stringify(update),
      })
    ).status,
  ).toBe(200);
  expect(await t.run((ctx) => ctx.db.query('messages').collect())).toHaveLength(0);
});
