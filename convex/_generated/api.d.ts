/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as chat_delivery from "../chat/delivery.js";
import type * as chat_errors from "../chat/errors.js";
import type * as chat_generation from "../chat/generation.js";
import type * as chat_images from "../chat/images.js";
import type * as chat_integration from "../chat/integration.js";
import type * as chat_policy from "../chat/policy.js";
import type * as chat_progress from "../chat/progress.js";
import type * as chat_response from "../chat/response.js";
import type * as chat_routing from "../chat/routing.js";
import type * as chat_types from "../chat/types.js";
import type * as chat_validators from "../chat/validators.js";
import type * as chatActions from "../chatActions.js";
import type * as chats from "../chats.js";
import type * as desktops from "../desktops.js";
import type * as flowMemory from "../flowMemory.js";
import type * as githubActions from "../githubActions.js";
import type * as githubAppConfig from "../githubAppConfig.js";
import type * as githubAuth from "../githubAuth.js";
import type * as githubInstallations from "../githubInstallations.js";
import type * as githubWebhookVerify from "../githubWebhookVerify.js";
import type * as http from "../http.js";
import type * as integrations_telegram_adapter from "../integrations/telegram/adapter.js";
import type * as integrations_telegram_client from "../integrations/telegram/client.js";
import type * as integrations_telegram_errors from "../integrations/telegram/errors.js";
import type * as integrations_telegram_images from "../integrations/telegram/images.js";
import type * as integrations_telegram_policy from "../integrations/telegram/policy.js";
import type * as integrations_telegram_text from "../integrations/telegram/text.js";
import type * as integrations_telegram_types from "../integrations/telegram/types.js";
import type * as integrations_telegram_updates from "../integrations/telegram/updates.js";
import type * as lib_pause from "../lib/pause.js";
import type * as repos from "../repos.js";
import type * as runs from "../runs.js";
import type * as settings from "../settings.js";
import type * as telegramWebhook from "../telegramWebhook.js";
import type * as tickets from "../tickets.js";
import type * as utils from "../utils.js";
import type * as viewer from "../viewer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "chat/delivery": typeof chat_delivery;
  "chat/errors": typeof chat_errors;
  "chat/generation": typeof chat_generation;
  "chat/images": typeof chat_images;
  "chat/integration": typeof chat_integration;
  "chat/policy": typeof chat_policy;
  "chat/progress": typeof chat_progress;
  "chat/response": typeof chat_response;
  "chat/routing": typeof chat_routing;
  "chat/types": typeof chat_types;
  "chat/validators": typeof chat_validators;
  chatActions: typeof chatActions;
  chats: typeof chats;
  desktops: typeof desktops;
  flowMemory: typeof flowMemory;
  githubActions: typeof githubActions;
  githubAppConfig: typeof githubAppConfig;
  githubAuth: typeof githubAuth;
  githubInstallations: typeof githubInstallations;
  githubWebhookVerify: typeof githubWebhookVerify;
  http: typeof http;
  "integrations/telegram/adapter": typeof integrations_telegram_adapter;
  "integrations/telegram/client": typeof integrations_telegram_client;
  "integrations/telegram/errors": typeof integrations_telegram_errors;
  "integrations/telegram/images": typeof integrations_telegram_images;
  "integrations/telegram/policy": typeof integrations_telegram_policy;
  "integrations/telegram/text": typeof integrations_telegram_text;
  "integrations/telegram/types": typeof integrations_telegram_types;
  "integrations/telegram/updates": typeof integrations_telegram_updates;
  "lib/pause": typeof lib_pause;
  repos: typeof repos;
  runs: typeof runs;
  settings: typeof settings;
  telegramWebhook: typeof telegramWebhook;
  tickets: typeof tickets;
  utils: typeof utils;
  viewer: typeof viewer;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
