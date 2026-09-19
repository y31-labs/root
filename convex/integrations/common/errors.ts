export class KnownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnownError';
  }
}

export class ConfigError extends KnownError {
  constructor(key: string) {
    super(`Missing key: ${key}`);
    this.name = 'ConfigError';
  }
}

export class VerificationError extends KnownError {
  constructor() {
    super('Verification failed');
    this.name = 'VerificationError';
  }
}

export class PayloadError extends KnownError {
  constructor(message: string) {
    super(`Payload error: ${message}`);
    this.name = 'PayloadError';
  }
}
