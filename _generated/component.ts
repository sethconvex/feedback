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
        {
          adminUserId: string;
          name: string;
          scopes?: Array<"build" | "triage">;
        },
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
          agentKey?: string;
          includeCompleted?: boolean;
          limit?: number;
          mode?: "all" | "chef" | "queue";
          viewer?: string | null;
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
    attachments: {
      add: FunctionReference<
        "mutation",
        "internal",
        {
          agentKey?: string;
          itemId: string;
          kind: "screenshot" | "audio";
          storageId: string;
          userId: string;
        },
        string,
        Name
      >;
      generateUploadUrl: FunctionReference<
        "mutation",
        "internal",
        {},
        string,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          agentKey?: string;
          includeCommunity?: boolean;
          itemId: string;
          viewer?: string | null;
        },
        Array<{
          _id: string;
          createdAt: number;
          kind: "screenshot" | "audio";
          mimeType: string;
          size: number;
          url: string | null;
        }>,
        Name
      >;
      listForItems: FunctionReference<
        "query",
        "internal",
        {
          agentKey?: string;
          includeCommunity?: boolean;
          itemIds: Array<string>;
          viewer?: string | null;
        },
        Array<{
          attachments: Array<{
            _id: string;
            createdAt: number;
            kind: "screenshot" | "audio";
            mimeType: string;
            size: number;
            url: string | null;
          }>;
          itemId: string;
        }>,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { agentKey?: string; attachmentId: string; userId: string },
        null,
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
          kind?: "feature" | "refinement";
          title: string;
          transcript?: string;
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
        {
          agentKey?: string;
          cursor?: string | null;
          limit?: number;
          viewer?: string | null;
        },
        { nextCursor: string | null; page: Array<any> },
        Name
      >;
      listAwaitingApproval: FunctionReference<
        "query",
        "internal",
        { agentKey?: string; limit?: number; viewer?: string | null },
        Array<any>,
        Name
      >;
      listByState: FunctionReference<
        "query",
        "internal",
        {
          agentKey?: string;
          cursor?: string | null;
          limit?: number;
          state:
            | "submitted"
            | "requested"
            | "planned"
            | "inProgress"
            | "rejected"
            | "completed";
          viewer?: string | null;
        },
        { nextCursor: string | null; page: Array<any> },
        Name
      >;
      listForTriage: FunctionReference<
        "query",
        "internal",
        { agentKey?: string; limit?: number; viewer?: string | null },
        Array<any>,
        Name
      >;
      listPublic: FunctionReference<
        "query",
        "internal",
        { cursor?: string | null; includeCommunity?: boolean; limit?: number },
        { nextCursor: string | null; page: Array<any> },
        Name
      >;
      listRefinementOpen: FunctionReference<
        "query",
        "internal",
        { agentKey?: string; limit?: number; viewer?: string | null },
        any,
        Name
      >;
      merge: FunctionReference<
        "mutation",
        "internal",
        { sourceId: string; targetId: string },
        null,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { itemId: string },
        null,
        Name
      >;
      review: FunctionReference<
        "mutation",
        "internal",
        { approve: boolean; itemId: string; reviewerId: string },
        | "submitted"
        | "requested"
        | "planned"
        | "inProgress"
        | "rejected"
        | "completed",
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
    progress: {
      listRecent: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        any,
        Name
      >;
      post: FunctionReference<
        "mutation",
        "internal",
        { kind: "step" | "shipped" | "note"; message: string },
        string,
        Name
      >;
    };
    settings: {
      get: FunctionReference<
        "query",
        "internal",
        {},
        { communityBoardVisible: boolean; runMode: "local" | "cloud" },
        Name
      >;
      set: FunctionReference<
        "mutation",
        "internal",
        { communityBoardVisible?: boolean; runMode?: "local" | "cloud" },
        null,
        Name
      >;
    };
    todos: {
      advance: FunctionReference<"mutation", "internal", {}, null, Name>;
      listAll: FunctionReference<"query", "internal", {}, any, Name>;
      plan: FunctionReference<
        "mutation",
        "internal",
        { items: Array<string> },
        null,
        Name
      >;
      setStatus: FunctionReference<
        "mutation",
        "internal",
        { id: string; status: "pending" | "active" | "done" },
        null,
        Name
      >;
    };
    users: {
      count: FunctionReference<"query", "internal", {}, number, Name>;
      ensure: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        { role: "admin" | "member"; userId: string },
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { userId: string },
        { createdAt: number; role: "admin" | "member"; userId: string } | null,
        Name
      >;
      listAdmins: FunctionReference<
        "query",
        "internal",
        {},
        Array<string>,
        Name
      >;
      setRole: FunctionReference<
        "mutation",
        "internal",
        { role: "admin" | "member"; userId: string },
        null,
        Name
      >;
    };
  };
