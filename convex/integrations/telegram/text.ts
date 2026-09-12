import { TELEGRAM_TEXT_LIMIT } from '#convex/integrations/telegram/policy';

export const splitTelegramText = (text: string): string[] => {
  const chunks: string[] = [];
  while (text.length > TELEGRAM_TEXT_LIMIT) {
    let end = TELEGRAM_TEXT_LIMIT;
    const last = text.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end--;
    chunks.push(text.slice(0, end));
    text = text.slice(end);
  }
  if (text) chunks.push(text);
  return chunks;
};
