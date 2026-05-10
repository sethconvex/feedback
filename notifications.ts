import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listForUser = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
    unreadOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, args.limit ?? 50));
    const q = args.unreadOnly
      ? ctx.db
          .query("notifications")
          .withIndex("by_user_and_read", (q) =>
            q.eq("userId", args.userId).eq("isRead", false),
          )
      : ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", args.userId));
    const rows = await q.order("desc").take(limit);
    return rows;
  },
});

export const unreadCount = query({
  args: { userId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userId", args.userId).eq("isRead", false),
      )
      .collect();
    return rows.length;
  },
});

export const markRead = mutation({
  args: { id: v.id("notifications"), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const n = await ctx.db.get(args.id);
    if (!n) return null;
    if (n.userId !== args.userId) throw new Error("Not your notification");
    await ctx.db.patch(args.id, { isRead: true });
    return null;
  },
});

export const markAllRead = mutation({
  args: { userId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userId", args.userId).eq("isRead", false),
      )
      .collect();
    for (const n of rows) {
      await ctx.db.patch(n._id, { isRead: true });
    }
    return rows.length;
  },
});
