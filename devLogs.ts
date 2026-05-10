import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const post = mutation({
  args: {
    itemId: v.id("items"),
    authorId: v.string(),
    message: v.string(),
  },
  returns: v.id("devLogs"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("devLogs", {
      itemId: args.itemId,
      authorId: args.authorId,
      message: args.message,
      stamp: Date.now(),
    });
  },
});

export const listForItem = query({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("devLogs")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();
    logs.sort((a, b) => a.stamp - b.stamp);
    return logs;
  },
});
