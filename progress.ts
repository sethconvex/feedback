import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const vKind = v.union(
  v.literal("step"),
  v.literal("shipped"),
  v.literal("note"),
);

export const post = mutation({
  args: { message: v.string(), kind: vKind },
  returns: v.id("progressUpdates"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("progressUpdates", {
      message: args.message.slice(0, 1000),
      kind: args.kind,
    });
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, args.limit ?? 20));
    return await ctx.db.query("progressUpdates").order("desc").take(limit);
  },
});
