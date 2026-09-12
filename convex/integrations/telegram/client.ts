import { TelegramError } from '#convex/integrations/telegram/errors';
import {
  TELEGRAM_DOWNLOAD_TIMEOUT_MS,
  TELEGRAM_RATE_LIMIT_RETRIES,
  TELEGRAM_REQUEST_TIMEOUT_MS,
} from '#convex/integrations/telegram/policy';
import type {
  TelegramClient,
  TelegramMethod,
  TelegramMethods,
  TelegramResponse,
} from '#convex/integrations/telegram/types';
import { pause } from '#convex/lib/pause';

export const createTelegramClient = (
  token: string,
  fetcher: typeof fetch = fetch,
): TelegramClient => {
  if (!token) throw new Error('Telegram bot is not configured');

  const call = async <M extends TelegramMethod>(
    method: M,
    body: TelegramMethods[M]['params'],
    signal: AbortSignal,
  ): Promise<TelegramMethods[M]['result']> => {
    for (let attempt = 0; ; attempt++) {
      let payload: TelegramResponse<TelegramMethods[M]['result']>;
      try {
        const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.any([signal, AbortSignal.timeout(TELEGRAM_REQUEST_TIMEOUT_MS)]),
        });
        payload = (await response.json()) as TelegramResponse<TelegramMethods[M]['result']>;
      } catch {
        throw new TelegramError(true);
      }
      if (payload.ok) return payload.result;
      const { error_code: code, parameters } = payload;
      if (
        code === 429 &&
        parameters?.retry_after !== undefined &&
        attempt < TELEGRAM_RATE_LIMIT_RETRIES
      ) {
        await pause(Math.max(1, parameters.retry_after) * 1000, signal);
        continue;
      }
      throw new TelegramError(code >= 500, code);
    }
  };

  const downloadFile = async (path: string, signal: AbortSignal): Promise<Response> => {
    try {
      return await fetcher(`https://api.telegram.org/file/bot${token}/${path}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(TELEGRAM_DOWNLOAD_TIMEOUT_MS)]),
        redirect: 'error',
      });
    } catch {
      throw new Error('Image download failed');
    }
  };

  return { call, downloadFile };
};
