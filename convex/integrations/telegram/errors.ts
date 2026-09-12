import { IntegrationDeliveryError } from '#convex/chat/errors';

export class TelegramError extends IntegrationDeliveryError {
  constructor(uncertain: boolean, code?: number) {
    super(code ? `Telegram request failed (${code})` : 'Telegram request failed', uncertain);
  }
}
