/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    agentKeys: {
      create: FunctionReference<
        "mutation",
        "internal",
        { adminUserId: string; name: string },
        { id: string; key: string },
        Name
      >;
      list: FunctionReference<"query", "internal", {}, any, Name>;
      revoke: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        null,
        Name
      >;
      touch: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        null,
        Name
      >;
      verify: FunctionReference<
        "query",
        "internal",
        { key: string },
        any,
        Name
      >;
    };
    agentState: {
      snapshot: FunctionReference<
        "query",
        "internal",
        {
          includeCompleted?: boolean;
          limit?: number;
          mode?: "all" | "chef" | "queue";
        },
        {
          counts: {
            inProgress: number;
            openRefinements: number;
            openTodos: number;
            progress: number;
            requested: number;
            todos: number;
          };
          progress: Array<any>;
          refinements: Array<any>;
          requests: Array<any>;
          todos: Array<any>;
        },
        Name
      >;
    };
    bids: {
      backfillStats: FunctionReference<
        "mutation",
        "internal",
        {},
        number,
        Name
      >;
      getUserBid: FunctionReference<
        "query",
        "internal",
        { itemId: string; userId: string },
        { _id: string; amount: number } | null,
        Name
      >;
      itemStats: FunctionReference<
        "query",
        "internal",
        { itemId: string },
        { supporterCount: number; totalAmount: number },
        Name
      >;
      place: FunctionReference<
        "mutation",
        "internal",
        { amount: number; itemId: string; userId: string },
        { bidId: string; delta: number; previousAmount: number },
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { itemId: string; userId: string },
        number,
        Name
      >;
    };
    devLogs: {
      listForItem: FunctionReference<
        "query",
        "internal",
        { itemId: string },
        any,
        Name
      >;
      post: FunctionReference<
        "mutation",
        "internal",
        { authorId: string; itemId: string; message: string },
        string,
        Name
      >;
    };
    items: {
      boost: FunctionReference<
        "mutation",
        "internal",
        { amount: number; grantedBy: string; itemId: string; reason?: string },
        number,
        Name
      >;
      countByState: FunctionReference<
        "query",
        "internal",
        {
          state:
            | "submitted"
            | "requested"
            | "planned"
            | "inProgress"
            | "rejected"
            | "completed";
        },
        number,
        Name
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          autoApprove?: boolean;
          description: string;
          title: string;
          userId: string;
        },
        string,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { itemId: string },
        any,
        Name
      >;
      listAll: FunctionReference<
        "query",
        "internal",
        { cursor?: string | null; limit?: number },
        { nextCursor: string | null; page: Array<any> },
        Name
      >;
      listByState: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string | null;
          limit?: number;
          state:
            | "submitted"
            | "requested"
            | "planned"
            | "inProgress"
            | "rejected"
            | "completed";
        },
        { nextCursor: string | null; page: Array<any> },
        Name
      >;
      listPublic: FunctionReference<
        "query",
        "internal",
        { cursor?: string | null; limit?: number },
        { nextCursor: string | null; page: Array<any> },
        Name
      >;
      merge: FunctionReference<
        "mutation",
        "internal",
        { sourceId: string; targetId: string },
        null,
        Name
      >;
      transitionState: FunctionReference<
        "mutation",
        "internal",
        {
          itemId: string;
          state:
            | "submitted"
            | "requested"
            | "planned"
            | "inProgress"
            | "rejected"
            | "completed";
        },
        null,
        Name
      >;
    };
    notifications: {
      listForUser: FunctionReference<
        "query",
        "internal",
        { limit?: number; unreadOnly?: boolean; userId: string },
        any,
        Name
      >;
      markAllRead: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        number,
        Name
      >;
      markRead: FunctionReference<
        "mutation",
        "internal",
        { id: string; userId: string },
        null,
        Name
      >;
      unreadCount: FunctionReference<
        "query",
        "internal",
        { userId: string },
        number,
        Name
      >;
    };
  };
