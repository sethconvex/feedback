// Agent API key storage. Host is responsible for admin-gating the
// list/create/revoke mutations (they take `adminUserId` purely for the
// audit trail — the component trusts whichever caller the host lets
// through).
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function generateKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return (
    "ship_" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agentKeys").order("desc").collect();
  },
});

export const create = mutation({
  args: { name: v.string(), adminUserId: v.string() },
  returns: v.object({ id: v.id("agentKeys"), key: v.string() }),
  handler: async (ctx, args) => {
    const key = generateKey();
    const id = await ctx.db.insert("agentKeys", {
      name: args.name,
      key,
      createdBy: args.adminUserId,
      revoked: false,
    });
    return { id, key };
  },
});

export const revoke = mutation({
  args: { id: v.id("agentKeys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { revoked: true });
    return null;
  },
});

export const verify = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("agentKeys")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (!row || row.revoked) return null;
    return row;
  },
});

export const touch = mutation({
  args: { id: v.id("agentKeys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastUsedAt: Date.now() });
    return null;
  },
});
