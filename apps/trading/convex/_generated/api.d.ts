/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as http from "../http.js";
import type * as lib_massive_client from "../lib/massive/client.js";
import type * as lib_massive_index from "../lib/massive/index.js";
import type * as lib_massive_marketData from "../lib/massive/marketData.js";
import type * as lib_massive_ticker from "../lib/massive/ticker.js";
import type * as lib_rateLimiter from "../lib/rateLimiter.js";
import type * as threads from "../threads.js";
import type * as utils from "../utils.js";
import type * as watchlist from "../watchlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  http: typeof http;
  "lib/massive/client": typeof lib_massive_client;
  "lib/massive/index": typeof lib_massive_index;
  "lib/massive/marketData": typeof lib_massive_marketData;
  "lib/massive/ticker": typeof lib_massive_ticker;
  "lib/rateLimiter": typeof lib_rateLimiter;
  threads: typeof threads;
  utils: typeof utils;
  watchlist: typeof watchlist;
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

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  actionCache: import("@convex-dev/action-cache/_generated/component.js").ComponentApi<"actionCache">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
