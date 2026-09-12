import type { TelegramMessage } from '#convex/integrations/telegram/types';

export const TELEGRAM_TEXT_LIMIT = 4096;
export const TELEGRAM_REQUEST_TIMEOUT_MS = 15_000;
export const TELEGRAM_DOWNLOAD_TIMEOUT_MS = 30_000;
export const TELEGRAM_RATE_LIMIT_RETRIES = 3;
export const TELEGRAM_TYPING_INTERVAL_MS = 4000;
export const TELEGRAM_DRAFT_INTERVAL_MS = 1000;

export const TELEGRAM_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const TELEGRAM_UNSUPPORTED_ATTACHMENTS = [
  'document',
  'voice',
  'audio',
  'video',
  'video_note',
  'sticker',
  'animation',
  'contact',
  'location',
  'venue',
  'poll',
  'dice',
  'paid_media',
] as const satisfies readonly (keyof TelegramMessage)[];
