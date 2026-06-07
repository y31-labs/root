/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as desktops from "../desktops.js";
import type * as githubActions from "../githubActions.js";
import type * as githubAppConfig from "../githubAppConfig.js";
import type * as githubAuth from "../githubAuth.js";
import type * as githubInstallations from "../githubInstallations.js";
import type * as githubWebhookVerify from "../githubWebhookVerify.js";
import type * as http from "../http.js";
import type * as repos from "../repos.js";
import type * as runs from "../runs.js";
import type * as settings from "../settings.js";
import type * as tickets from "../tickets.js";
import type * as utils from "../utils.js";
import type * as viewer from "../viewer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  desktops: typeof desktops;
  githubActions: typeof githubActions;
  githubAppConfig: typeof githubAppConfig;
  githubAuth: typeof githubAuth;
  githubInstallations: typeof githubInstallations;
  githubWebhookVerify: typeof githubWebhookVerify;
  http: typeof http;
  repos: typeof repos;
  runs: typeof runs;
  settings: typeof settings;
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
