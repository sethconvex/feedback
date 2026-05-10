import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { vState } from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

async function nextItemNumber(ctx: any): Promise<number> {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_name", (q: any) => q.eq("name", "item"))
    .unique();
  if (!counter) {
    await ctx.db.insert("counters", { name: "item", value: 1 });
    return 1;
  }
  const next = counter.value + 1;
  await ctx.db.patch(counter._id, { value: next });
  return next;
}

function enrich(item: Doc<"items">) {
  return {
    ...item,
    stats: {
      totalAmount: item.totalAmount ?? 0,
      supporterCount: item.supporterCount ?? 0,
    },
  };
}

async function notifySupporters(
  ctx: any,
  itemId: Id<"items">,
  type:
    | "approved"
    | "rejected"
    | "stateChanged"
    | "completed"
    | "merged"
    | "devLog",
  message: string,
) {
  const bids: Doc<"bids">[] = await ctx.db
    .query("bids")
    .withIndex("by_item", (q: any) => q.eq("itemId", itemId))
    .collect();
  const seen = new Set<string>();
  for (const bid of bids) {
    if (seen.has(bid.userId)) continue;
    seen.add(bid.userId);
    await ctx.db.insert("notifications", {
      userId: bid.userId,
      itemId,
      type,
      message,
      isRead: false,
      stamp: Date.now(),
    });
  }
}

export const create = mutation({
  args: {
    userId: v.string(),
    title: v.string(),
    description: v.string(),
    autoApprove: v.optional(v.boolean()),
  },
  returns: v.id("items"),
  handler: async (ctx, args) => {
    const number = await nextItemNumber(ctx);
    return await ctx.db.insert("items", {
      number,
      title: args.title,
      description: args.description,
      state: args.autoApprove ? "requested" : "submitted",
      createdBy: args.userId,
      totalAmount: 0,
      supporterCount: 0,
    });
  },
});

export const get = query({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    return item ? enrich(item) : null;
  },
});

// ---------- paginated listings ----------

const listReturnShape = v.object({
  page: v.array(v.any()),
  nextCursor: v.union(v.string(), v.null()),
});

/**
 * Cursor format: the numeric `_creationTime` of the last item in the previous
 * page. `null` on the first call; the response echoes a `nextCursor` (or
 * `null` when the page is the last one).
 */
export const listByState = query({
  args: {
    state: vState,
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: listReturnShape,
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, args.limit ?? 20));
    const cursor = args.cursor ? Number(args.cursor) : null;
    const q = ctx.db
      .query("items")
      .withIndex("by_state", (q) =>
        cursor
          ? q.eq("state", args.state).lt("_creationTime", cursor)
          : q.eq("state", args.state),
      )
      .order("desc");
    const raw: Doc<"items">[] = await q.take(limit + 1);
    const visible = raw.filter((i) => !i.mergedInto);
    const page = visible.slice(0, limit).map(enrich);
    page.sort((a, b) => b.stats.totalAmount - a.stats.totalAmount);
    const nextCursor =
      visible.length > limit
        ? String(visible[limit - 1]._creationTime)
        : null;
    return { page, nextCursor };
  },
});

export const listPublic = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: listReturnShape,
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, args.limit ?? 20));
    const cursor = args.cursor ? Number(args.cursor) : null;
    let q = ctx.db.query("items").order("desc");
    if (cursor) {
      q = q.filter((qq: any) =>
        qq.lt(qq.field("_creationTime"), cursor),
      ) as any;
    }
    const raw: Doc<"items">[] = await q.take(limit * 3);
    const visible = raw.filter(
      (i) =>
        i.state !== "submitted" && i.state !== "rejected" && !i.mergedInto,
    );
    const page = visible.slice(0, limit).map(enrich);
    const nextCursor =
      raw.length >= limit * 3
        ? String(raw[raw.length - 1]._creationTime)
        : null;
    return { page, nextCursor };
  },
});

export const listAll = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: listReturnShape,
  handler: async (ctx, args) => {
    const limit = Math.min(200, Math.max(1, args.limit ?? 100));
    const cursor = args.cursor ? Number(args.cursor) : null;
    let q = ctx.db.query("items").order("desc");
    if (cursor) {
      q = q.filter((qq: any) =>
        qq.lt(qq.field("_creationTime"), cursor),
      ) as any;
    }
    const raw: Doc<"items">[] = await q.take(limit + 1);
    const page = raw.slice(0, limit).map(enrich);
    const nextCursor =
      raw.length > limit ? String(raw[limit - 1]._creationTime) : null;
    return { page, nextCursor };
  },
});

// ---------- state transitions (with notifications) ----------

export const transitionState = mutation({
  args: { itemId: v.id("items"), state: vState },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    if (item.state === args.state) return null;

    const patch: any = { state: args.state };
    if (args.state === "completed") patch.completedAt = Date.now();
    await ctx.db.patch(args.itemId, patch);

    const type =
      args.state === "requested" && item.state === "submitted"
        ? "approved"
        : args.state === "rejected"
          ? "rejected"
          : args.state === "completed"
            ? "completed"
            : "stateChanged";
    const message =
      type === "approved"
        ? `"${item.title}" was approved and is now accepting votes.`
        : type === "rejected"
          ? `"${item.title}" was rejected.`
          : type === "completed"
            ? `"${item.title}" has shipped!`
            : `"${item.title}" is now ${args.state}.`;
    await notifySupporters(ctx, args.itemId, type, message);
    // Also notify the submitter even if they haven't bid on it.
    const supporters = await ctx.db
      .query("bids")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();
    const submitterAlreadyNotified = supporters.some(
      (b) => b.userId === item.createdBy,
    );
    if (!submitterAlreadyNotified) {
      await ctx.db.insert("notifications", {
        userId: item.createdBy,
        itemId: args.itemId,
        type,
        message,
        isRead: false,
        stamp: Date.now(),
      });
    }
    return null;
  },
});

// ---------- merging ----------

export const merge = mutation({
  args: { sourceId: v.id("items"), targetId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.sourceId === args.targetId) {
      throw new Error("Cannot merge an item into itself");
    }
    const source = await ctx.db.get(args.sourceId);
    const target = await ctx.db.get(args.targetId);
    if (!source) throw new Error("Source item not found");
    if (!target) throw new Error("Target item not found");
    if (source.mergedInto) throw new Error("Source is already merged");
    if (target.mergedInto)
      throw new Error("Target has itself been merged; pick the final item");

    const sourceBids: Doc<"bids">[] = await ctx.db
      .query("bids")
      .withIndex("by_item", (q) => q.eq("itemId", args.sourceId))
      .collect();

    let targetAmountDelta = 0;
    let targetSupporterDelta = 0;
    for (const bid of sourceBids) {
      const existingOnTarget = await ctx.db
        .query("bids")
        .withIndex("by_item_and_user", (q) =>
          q.eq("itemId", args.targetId).eq("userId", bid.userId),
        )
        .unique();
      if (existingOnTarget) {
        await ctx.db.patch(existingOnTarget._id, {
          amount: existingOnTarget.amount + bid.amount,
        });
        await ctx.db.delete(bid._id);
        targetAmountDelta += bid.amount;
      } else {
        await ctx.db.patch(bid._id, { itemId: args.targetId });
        targetAmountDelta += bid.amount;
        targetSupporterDelta += 1;
      }
    }
    if (targetAmountDelta !== 0 || targetSupporterDelta !== 0) {
      await ctx.db.patch(args.targetId, {
        totalAmount: (target.totalAmount ?? 0) + targetAmountDelta,
        supporterCount:
          (target.supporterCount ?? 0) + targetSupporterDelta,
      });
    }
    await ctx.db.patch(args.sourceId, {
      mergedInto: args.targetId,
      totalAmount: 0,
      supporterCount: 0,
    });

    await notifySupporters(
      ctx,
      args.targetId,
      "merged",
      `"${source.title}" was merged into "${target.title}".`,
    );
    return null;
  },
});

/**
 * Directly bump an item's vote total without creating a bid row.
 *
 * The host is expected to gate this behind an admin check and translate its
 * own economy onto `amount` (chips, credits, weight — the component is
 * agnostic). A dev-log entry is written for audit.
 */
export const boost = mutation({
  args: {
    itemId: v.id("items"),
    amount: v.number(),
    grantedBy: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    if (item.mergedInto) throw new Error("Item was merged");
    const newTotal = Math.max(0, (item.totalAmount ?? 0) + args.amount);
    await ctx.db.patch(args.itemId, { totalAmount: newTotal });
    const sign = args.amount >= 0 ? "+" : "";
    const reason = args.reason ? ` — ${args.reason}` : "";
    await ctx.db.insert("devLogs", {
      itemId: args.itemId,
      authorId: args.grantedBy,
      message: `🎁 Boost: ${sign}${args.amount}${reason}`,
      stamp: Date.now(),
    });
    return newTotal;
  },
});

export const countByState = query({
  args: { state: vState },
  returns: v.number(),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("items")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .collect();
    return items.length;
  },
});
