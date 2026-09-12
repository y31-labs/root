import type {
  ChatFailure,
  ChatFailureContext,
  ChatGenerationErrorCode,
  ImageInputErrorCode,
  ResponseStage,
} from '#convex/chat/types';

export const classifyGenerationError = (
  statusCode: number | undefined,
  code?: string,
): ChatGenerationError => {
  if (code === 'aborted') return new ChatGenerationError('aborted', statusCode);
  if (statusCode === 401 || statusCode === 403)
    return new ChatGenerationError('access_denied', statusCode);
  return new ChatGenerationError('failed', statusCode);
};

export class ChatGenerationError extends Error {
  constructor(
    readonly code: ChatGenerationErrorCode,
    readonly statusCode?: number,
  ) {
    super(getChatGenerationErrorMessage(code));
  }
}

const getChatGenerationErrorMessage = (code: ChatGenerationErrorCode): string => {
  switch (code) {
    case 'access_denied':
      return 'AI Gateway access denied';
    case 'aborted':
      return 'Response generation timed out or was cancelled';
    default:
      return 'Response generation failed';
  }
};

export class ImageInputError extends Error {
  constructor(readonly code: ImageInputErrorCode) {
    super(getImageInputErrorMessage(code));
  }
}

const getImageInputErrorMessage = (code: ImageInputErrorCode): string => {
  switch (code) {
    case 'too_large':
      return 'Image exceeds 10 MB';
    case 'unsupported_channel':
      return 'Channel does not support images';
    case 'unsupported_format':
      return 'Unsupported image format';
  }
};

export class IntegrationDeliveryError extends Error {
  constructor(
    message: string,
    readonly uncertain: boolean,
  ) {
    super(message);
  }
}

export const classifyChatFailure = (error: unknown, stage: ResponseStage): ChatFailure => {
  if (stage === 'delivery') return { code: 'failed', message: 'Response delivery failed' };
  if (error instanceof ChatGenerationError) {
    return {
      code: error.code,
      message: getChatGenerationErrorMessage(error.code),
      ...(error.statusCode !== undefined ? { statusCode: error.statusCode } : {}),
    };
  }
  if (error instanceof ImageInputError) {
    return { code: error.code, message: getImageInputErrorMessage(error.code) };
  }
  return { code: 'failed', message: 'Response generation failed' };
};

export const logChatFailure = (failure: ChatFailure, context: ChatFailureContext): void => {
  console.error('Chat response failed', {
    ...context,
    code: failure.code,
    ...(failure.statusCode !== undefined ? { statusCode: failure.statusCode } : {}),
  });
};
