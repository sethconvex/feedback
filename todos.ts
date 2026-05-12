import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const vStatus = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("done"),
);

// Replace the entire checklist in one shot. Typical agent usage: call once
// up front with the plan, then drive state via `advance` / `setStatus`.
export const plan = mutation({
  args: { items: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("todos").collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    let order = 0;
    for (const text of args.items) {
      await ctx.db.insert("todos", {
        text: text.slice(0, 400),
        order: order++,
        status: order === 1 ? "active" : "pending",
      });
    }
    return null;
  },
});

// Mark the current active row done and flip the next pending row to active.
// No-op if nothing is pending.
export const advance = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db.query("todos").withIndex("by_order").collect();
    rows.sort((a, b) => a.order - b.order);
    const active = rows.find((r) => r.status === "active");
    if (active) await ctx.db.patch(active._id, { status: "done" });
    const nextPending = rows.find((r) => r.status === "pending");
    if (nextPending) await ctx.db.patch(nextPending._id, { status: "active" });
    return null;
  },
});

export const setStatus = mutation({
  args: { id: v.id("todos"), status: vStatus },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status });
    return null;
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("todos").withIndex("by_order").collect();
    rows.sort((a, b) => a.order - b.order);
    return rows;
  },
});
