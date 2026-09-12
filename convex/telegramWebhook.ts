import { internal } from '#convex/_generated/api';
import { httpAction } from '#convex/_generated/server';
import type { TelegramUpdate } from '#convex/integrations/telegram/types';
import { parseTelegramUpdate } from '#convex/integrations/telegram/updates';

export const telegramWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!secret || !token) return new Response('Telegram is not configured', { status: 503 });
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }
  let message;
  try {
    const update = (await request.json()) as TelegramUpdate;
    message = parseTelegramUpdate(update, token.split(':')[0]!);
  } catch {
    return new Response('Invalid update', { status: 400 });
  }
  if (message) await ctx.runMutation(internal.chats.receive, { message });
  return new Response('OK');
});
