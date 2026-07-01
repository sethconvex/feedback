import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const vRole = v.union(v.literal("admin"), v.literal("member"));

// The component now owns a sense of "who's who". Consistent with the trust
// model (the component never reads ctx.auth — the host forwards a trusted
// userId), the host calls `ensure` with the authenticated userId after sign-in.
//
// The FIRST user to register becomes the **admin** (the app's creator); everyone
// after is a **member**. Roles drive visibility: only admins (and agents, via an
// agentKey) may list all active requests/refinements or see build status once
// real users exist. See access.ts.

export const ensure = mutation({
  args: { userId: v.string() },
  returns: v.object({ userId: v.string(), role: vRole }),
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) return { userId, role: existing.role };
    const isFirst = (await ctx.db.query("users").take(1)).length === 0;
    const role = isFirst ? ("admin" as const) : ("member" as const);
    await ctx.db.insert("users", { userId, role, createdAt: Date.now() });
    return { userId, role };
  },
});

export const get = query({
  args: { userId: v.string() },
  returns: v.union(
    v.object({ userId: v.string(), role: vRole, createdAt: v.number() }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const u = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return u ? { userId: u.userId, role: u.role, createdAt: u.createdAt } : null;
  },
});

// Total registered users. Powers the "show build status only when there are no
// users (or an admin)" rule.
export const count = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => (await ctx.db.query("users").collect()).length,
});

// Admin management: promote/demote. Host gates the call to an existing admin.
export const setRole = mutation({
  args: { userId: v.string(), role: vRole },
  returns: v.null(),
  handler: async (ctx, { userId, role }) => {
    const u = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (u) await ctx.db.patch(u._id, { role });
    else await ctx.db.insert("users", { userId, role, createdAt: Date.now() });
    return null;
  },
});
