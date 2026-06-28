import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Owner-controlled settings, stored as a single row (key:"singleton").
//
// The component does NOT gate `set` itself — the host wraps it behind its own
// admin check (the host owns identity), exactly like `items.boost` /
// `bids.backfillStats`. `get` is unprivileged: the values it exposes
// (communityBoardVisible, runMode) are not sensitive, and the host needs them to
// render the public board and pick a worker.

const DEFAULTS = {
  communityBoardVisible: true,
  runMode: "local" as const,
};

export const get = query({
  args: {},
  returns: v.object({
    communityBoardVisible: v.boolean(),
    runMode: v.union(v.literal("local"), v.literal("cloud")),
  }),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "singleton"))
      .unique();
    return {
      communityBoardVisible:
        row?.communityBoardVisible ?? DEFAULTS.communityBoardVisible,
      runMode: row?.runMode ?? DEFAULTS.runMode,
    };
  },
});

export const set = mutation({
  args: {
    communityBoardVisible: v.optional(v.boolean()),
    runMode: v.optional(v.union(v.literal("local"), v.literal("cloud"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "singleton"))
      .unique();
    const next = {
      key: "singleton" as const,
      communityBoardVisible:
        args.communityBoardVisible ??
        row?.communityBoardVisible ??
        DEFAULTS.communityBoardVisible,
      runMode: args.runMode ?? row?.runMode ?? DEFAULTS.runMode,
    };
    if (row) {
      await ctx.db.patch(row._id, next);
    } else {
      await ctx.db.insert("settings", next);
    }
    return null;
  },
});
