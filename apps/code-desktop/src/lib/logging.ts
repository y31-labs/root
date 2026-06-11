import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import posthog from 'posthog-js';

export type LogLevel = 'info' | 'warn' | 'error';

export type LogAttributes = Record<string, string | number | boolean | null | undefined>;

export interface PostHogLogEvent {
  level: LogLevel;
  message: string;
  attributes?: LogAttributes;
}

interface LogClient {
  logger: Record<LogLevel, (message: string, attributes?: LogAttributes) => void>;
}

const allowedMessages = new Set([
  'application started',
  'frontend failure',
  'authentication completed',
  'authentication failed',
  'authentication cleared',
  'chat provider connection failed',
  'chat operation failed',
  'local run started',
  'local run cancellation requested',
  'local run transitioned',
  'local run gate completed',
  'local run completed',
  'codex app server started',
  'codex app server stopped',
  'codex request failed',
]);

const allowedAttributeKeys = new Set([
  'application',
  'attempt',
  'authenticated',
  'available',
  'changedFileCount',
  'durationMs',
  'errorCategory',
  'exitCode',
  'gate',
  'hasLocalPatch',
  'installationId',
  'operation',
  'provider',
  'required',
  'runId',
  'source',
  'status',
  'threadId',
]);

export function sanitizeLogEvent(event: PostHogLogEvent): PostHogLogEvent | undefined {
  if (!allowedMessages.has(event.message)) return undefined;
  const attributes = Object.fromEntries(
    Object.entries(event.attributes ?? {}).filter(
      ([key, value]) =>
        allowedAttributeKeys.has(key) &&
        (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'),
    ),
  );
  return { level: event.level, message: event.message, attributes };
}

export function errorCategory(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
  if (error instanceof TypeError) return 'type';
  if (error instanceof RangeError) return 'range';
  if (error instanceof SyntaxError) return 'syntax';
  if (error instanceof URIError) return 'uri';
  if (error instanceof EvalError) return 'eval';
  if (error instanceof Error) return 'error';
  return 'unknown';
}

export class DesktopLogger {
  private installationId?: Promise<string | undefined>;

  constructor(
    private readonly client?: LogClient,
    private readonly getInstallationId: () => Promise<string> = () =>
      invoke<string>('installation_id'),
  ) {}

  info(message: string, attributes?: LogAttributes) {
    void this.write({ level: 'info', message, attributes });
  }

  warn(message: string, attributes?: LogAttributes) {
    void this.write({ level: 'warn', message, attributes });
  }

  error(message: string, attributes?: LogAttributes) {
    void this.write({ level: 'error', message, attributes });
  }

  async write(event: PostHogLogEvent) {
    if (!this.client) return;
    const sanitized = sanitizeLogEvent(event);
    if (!sanitized) return;
    this.installationId ??= this.getInstallationId().catch(() => undefined);
    const installationId = await this.installationId;
    try {
      this.client.logger[sanitized.level](sanitized.message, {
        application: 'code-desktop',
        source: 'frontend',
        ...sanitized.attributes,
        ...(installationId ? { installationId } : {}),
      });
    } catch {
      // Observability must never affect application behavior.
    }
  }
}

let logger = new DesktopLogger();
let disposeBackendListener: Promise<UnlistenFn> | undefined;

function validPostHogHost(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function initializeLogging() {
  const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN?.trim();
  const host = import.meta.env.VITE_POSTHOG_HOST?.trim();
  if (!token || !host || !validPostHogHost(host)) return;

  try {
    posthog.init(token, {
      api_host: host,
      defaults: '2026-01-30',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      disable_session_recording: true,
      logs: {
        captureConsoleLogs: false,
        environment: import.meta.env.MODE,
        serviceName: 'code-desktop',
        serviceVersion: '0.1.0',
      },
    });
    logger = new DesktopLogger(posthog);
    disposeBackendListener = listen<PostHogLogEvent>('posthog-log', ({ payload }) => {
      void logger.write({
        ...payload,
        attributes: { ...payload.attributes, source: 'engine' },
      });
    }).catch(() => () => {});
  } catch {
    logger = new DesktopLogger();
  }
}

export function registerGlobalLogging() {
  logger.info('application started', { operation: 'startup' });
  window.addEventListener('error', (event) => {
    logger.error('frontend failure', {
      operation: 'window-error',
      errorCategory: errorCategory(event.error),
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    logger.error('frontend failure', {
      operation: 'unhandled-rejection',
      errorCategory: errorCategory(event.reason),
    });
  });
}

export const desktopLogger = {
  info: (message: string, attributes?: LogAttributes) => logger.info(message, attributes),
  warn: (message: string, attributes?: LogAttributes) => logger.warn(message, attributes),
  error: (message: string, attributes?: LogAttributes) => logger.error(message, attributes),
};

export async function disposeLogging() {
  const dispose = await disposeBackendListener;
  dispose?.();
  disposeBackendListener = undefined;
}
