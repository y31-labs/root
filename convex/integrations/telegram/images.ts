import { ImageInputError } from '#convex/chat/errors';
import { MAX_IMAGE_BYTES } from '#convex/chat/policy';
import type { SourceImage } from '#convex/chat/types';
import type { TelegramClient } from '#convex/integrations/telegram/types';

const detectImageType = (bytes: Uint8Array): string | null => {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    return 'image/png';
  }
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
};

export const readImage = async (response: Response): Promise<Blob> => {
  if (!response.ok || !response.body) throw new Error('Image download failed');
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
    await response.body.cancel();
    throw new ImageInputError('too_large');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) throw new ImageInputError('too_large');
      chunks.push(new Uint8Array(value));
    }
  } finally {
    await reader.cancel();
  }
  const blob = new Blob(chunks);
  const mediaType = detectImageType(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
  if (!mediaType) throw new ImageInputError('unsupported_format');
  return new Blob([blob], { type: mediaType });
};

export const downloadTelegramImage = async (
  telegram: TelegramClient,
  source: SourceImage,
  signal: AbortSignal,
): Promise<Blob> => {
  if (source.size !== undefined && source.size > MAX_IMAGE_BYTES)
    throw new ImageInputError('too_large');
  const file = await telegram.call('getFile', { file_id: source.externalFileId }, signal);
  if (!file.file_path) throw new Error('Image file path is unavailable');
  if (file.file_size !== undefined && file.file_size > MAX_IMAGE_BYTES)
    throw new ImageInputError('too_large');
  try {
    return await readImage(await telegram.downloadFile(file.file_path, signal));
  } catch (error) {
    if (error instanceof ImageInputError) throw error;
    throw new Error('Image download failed');
  }
};
