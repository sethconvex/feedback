import type {
  GenericQueryCtx,
  GenericMutationCtx,
} from "convex/server";
import type { GenericId } from "convex/values";

// We intentionally do NOT import from "../_generated/api" here — that file only
// exists after `convex dev` has run, and the client needs to be importable
// before then. The host receives the component API from its own generated
// `components.feedback` object and passes it in.
type ShipApi = any;

type RunQueryCtx = GenericQueryCtx<any>;
type RunMutationCtx = GenericMutationCtx<any>;

export type ItemState =
  | "submitted"
  | "requested"
  | "planned"
  | "inProgress"
  | "rejected"
  | "completed";

/**
 * Thin typed wrapper around the Ship component API.
 *
 * Host usage (inside its own query/mutation after authenticating the user):
 *
 *   import { components } from "./_generated/api";
 *   import { Ship } from "@convex-dev/feedback";
 *   const ship = new Ship(components.feedback);
 *   await ship.items.create(ctx, { userId, title, description });
 *
 * The host is responsible for:
 *   - authenticating the user and passing a stable `userId` string
 *   - gating admin operations (listAll, transitionState, post dev logs)
 *   - (optional) debiting/crediting its own chip economy around bids
 */
export class Ship {
  constructor(public component: ShipApi) {}

  items = {
    create: (
      ctx: RunMutationCtx,
      args: {
        userId: string;
        title: string;
        description: string;
        autoApprove?: boolean;
        kind?: "feature" | "refinement";
      },
    ) => ctx.runMutation(this.component.items.create, args),

    listRefinementOpen: (
      ctx: RunQueryCtx,
      args: { limit?: number } = {},
    ) => ctx.runQuery(this.component.items.listRefinementOpen, args),

    get: (ctx: RunQueryCtx, args: { itemId: GenericId<"items"> }) =>
      ctx.runQuery(this.component.items.get, args),

    transitionState: (
      ctx: RunMutationCtx,
      args: { itemId: GenericId<"items">; state: ItemState },
    ) => ctx.runMutation(this.component.items.transitionState, args),

    listPublic: (
      ctx: RunQueryCtx,
      args: { limit?: number; cursor?: string | null } = {},
    ) => ctx.runQuery(this.component.items.listPublic, args),

    listByState: (
      ctx: RunQueryCtx,
      args: { state: ItemState; limit?: number; cursor?: string | null },
    ) => ctx.runQuery(this.component.items.listByState, args),

    listAll: (
      ctx: RunQueryCtx,
      args: { limit?: number; cursor?: string | null } = {},
    ) => ctx.runQuery(this.component.items.listAll, args),

    countByState: (ctx: RunQueryCtx, args: { state: ItemState }) =>
      ctx.runQuery(this.component.items.countByState, args),

    merge: (
      ctx: RunMutationCtx,
      args: {
        sourceId: GenericId<"items">;
        targetId: GenericId<"items">;
      },
    ) => ctx.runMutation(this.component.items.merge, args),

    boost: (
      ctx: RunMutationCtx,
      args: {
        itemId: GenericId<"items">;
        amount: number;
        grantedBy: string;
        reason?: string;
      },
    ) => ctx.runMutation(this.component.items.boost, args),
  };

  bids = {
    place: (
      ctx: RunMutationCtx,
      args: { userId: string; itemId: GenericId<"items">; amount: number },
    ) => ctx.runMutation(this.component.bids.place, args),

    remove: (
      ctx: RunMutationCtx,
      args: { userId: string; itemId: GenericId<"items"> },
    ) => ctx.runMutation(this.component.bids.remove, args),

    getUserBid: (
      ctx: RunQueryCtx,
      args: { userId: string; itemId: GenericId<"items"> },
    ) => ctx.runQuery(this.component.bids.getUserBid, args),

    itemStats: (ctx: RunQueryCtx, args: { itemId: GenericId<"items"> }) =>
      ctx.runQuery(this.component.bids.itemStats, args),

    backfillStats: (ctx: RunMutationCtx) =>
      ctx.runMutation(this.component.bids.backfillStats, {}),
  };

  devLogs = {
    post: (
      ctx: RunMutationCtx,
      args: {
        itemId: GenericId<"items">;
        authorId: string;
        message: string;
      },
    ) => ctx.runMutation(this.component.devLogs.post, args),

    listForItem: (
      ctx: RunQueryCtx,
      args: { itemId: GenericId<"items"> },
    ) => ctx.runQuery(this.component.devLogs.listForItem, args),
  };

  notifications = {
    listForUser: (
      ctx: RunQueryCtx,
      args: { userId: string; limit?: number; unreadOnly?: boolean },
    ) => ctx.runQuery(this.component.notifications.listForUser, args),

    unreadCount: (ctx: RunQueryCtx, args: { userId: string }) =>
      ctx.runQuery(this.component.notifications.unreadCount, args),

    markRead: (
      ctx: RunMutationCtx,
      args: { id: GenericId<"notifications">; userId: string },
    ) => ctx.runMutation(this.component.notifications.markRead, args),

    markAllRead: (ctx: RunMutationCtx, args: { userId: string }) =>
      ctx.runMutation(this.component.notifications.markAllRead, args),
  };

  todos = {
    plan: (ctx: RunMutationCtx, args: { items: string[] }) =>
      ctx.runMutation(this.component.todos.plan, args),

    advance: (ctx: RunMutationCtx) =>
      ctx.runMutation(this.component.todos.advance, {}),

    setStatus: (
      ctx: RunMutationCtx,
      args: {
        id: GenericId<"todos">;
        status: "pending" | "active" | "done";
      },
    ) => ctx.runMutation(this.component.todos.setStatus, args),

    listAll: (ctx: RunQueryCtx) =>
      ctx.runQuery(this.component.todos.listAll, {}),
  };

  progress = {
    post: (
      ctx: RunMutationCtx,
      args: { message: string; kind: "step" | "shipped" | "note" },
    ) => ctx.runMutation(this.component.progress.post, args),

    listRecent: (ctx: RunQueryCtx, args: { limit?: number } = {}) =>
      ctx.runQuery(this.component.progress.listRecent, args),
  };

  agentKeys = {
    list: (ctx: RunQueryCtx) =>
      ctx.runQuery(this.component.agentKeys.list, {}),

    create: (
      ctx: RunMutationCtx,
      args: { name: string; adminUserId: string },
    ) => ctx.runMutation(this.component.agentKeys.create, args),

    revoke: (
      ctx: RunMutationCtx,
      args: { id: GenericId<"agentKeys"> },
    ) => ctx.runMutation(this.component.agentKeys.revoke, args),
  };
}

