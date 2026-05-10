import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

async function adjustItemStats(
  ctx: any,
  itemId: Id<"items">,
  deltaAmount: number,
  deltaSupporters: number,
) {
  const item = await ctx.db.get(itemId);
  if (!item) return;
  await ctx.db.patch(itemId, {
    totalAmount: Math.max(0, (item.totalAmount ?? 0) + deltaAmount),
    supporterCount: Math.max(0, (item.supporterCount ?? 0) + deltaSupporters),
  });
}

export const place = mutation({
  args: {
    userId: v.string(),
    itemId: v.id("items"),
    amount: v.number(),
  },
  returns: v.object({
    bidId: v.id("bids"),
    previousAmount: v.number(),
    delta: v.number(),
  }),
  handler: async (ctx, args) => {
    if (args.amount < 1) throw new Error("amount must be >= 1");

    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    if (item.state === "submitted") throw new Error("Item is under review");
    if (item.state === "completed" || item.state === "rejected") {
      throw new Error("Item is closed for voting");
    }
    if (item.mergedInto) {
      throw new Error("Item was merged — vote on the target instead");
    }

    const existing = await ctx.db
      .query("bids")
      .withIndex("by_item_and_user", (q) =>
        q.eq("itemId", args.itemId).eq("userId", args.userId),
      )
      .unique();

    if (existing) {
      const delta = args.amount - existing.amount;
      await ctx.db.patch(existing._id, { amount: args.amount });
      if (delta !== 0) {
        await adjustItemStats(ctx, args.itemId, delta, 0);
      }
      return { bidId: existing._id, previousAmount: existing.amount, delta };
    }

    const bidId = await ctx.db.insert("bids", {
      itemId: args.itemId,
      userId: args.userId,
      amount: args.amount,
    });
    await adjustItemStats(ctx, args.itemId, args.amount, 1);
    return { bidId, previousAmount: 0, delta: args.amount };
  },
});

export const remove = mutation({
  args: { userId: v.string(), itemId: v.id("items") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const bid = await ctx.db
      .query("bids")
      .withIndex("by_item_and_user", (q) =>
        q.eq("itemId", args.itemId).eq("userId", args.userId),
      )
      .unique();
    if (!bid) return 0;
    await ctx.db.delete(bid._id);
    await adjustItemStats(ctx, args.itemId, -bid.amount, -1);
    return bid.amount;
  },
});

export const getUserBid = query({
  args: { userId: v.string(), itemId: v.id("items") },
  returns: v.union(
    v.object({ _id: v.id("bids"), amount: v.number() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const bid = await ctx.db
      .query("bids")
      .withIndex("by_item_and_user", (q) =>
        q.eq("itemId", args.itemId).eq("userId", args.userId),
      )
      .unique();
    return bid ? { _id: bid._id, amount: bid.amount } : null;
  },
});

export const itemStats = query({
  args: { itemId: v.id("items") },
  returns: v.object({
    totalAmount: v.number(),
    supporterCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return { totalAmount: 0, supporterCount: 0 };
    return {
      totalAmount: item.totalAmount ?? 0,
      supporterCount: item.supporterCount ?? 0,
    };
  },
});

/**
 * Admin/one-shot utility: recompute denormalized stats from the bids table.
 * Safe to call repeatedly. Host should gate this.
 */
export const backfillStats = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const items = await ctx.db.query("items").collect();
    for (const item of items) {
      const bids: Doc<"bids">[] = await ctx.db
        .query("bids")
        .withIndex("by_item", (q) => q.eq("itemId", item._id))
        .collect();
      const totalAmount = bids.reduce((s, b) => s + b.amount, 0);
      await ctx.db.patch(item._id, {
        totalAmount,
        supporterCount: bids.length,
      });
    }
    return items.length;
  },
});
