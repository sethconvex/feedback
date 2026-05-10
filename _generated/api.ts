/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentKeys from "../agentKeys.js";
import type * as bids from "../bids.js";
import type * as devLogs from "../devLogs.js";
import type * as items from "../items.js";
import type * as notifications from "../notifications.js";
import type * as src_client from "../src/client.js";
import type * as src_http from "../src/http.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  agentKeys: typeof agentKeys;
  bids: typeof bids;
  devLogs: typeof devLogs;
  items: typeof items;
  notifications: typeof notifications;
  "src/client": typeof src_client;
  "src/http": typeof src_http;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
