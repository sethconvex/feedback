import { v } from "convex/values";
import { query } from "./_generated/server";

const vMode = v.union(
  v.literal("all"),
  v.literal("chef"),
  v.literal("queue"),
);

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  return Math.min(max, Math.max(1, value ?? fallback));
}

/**
 * CLI-friendly build-mode snapshot for coding agents.
 *
 * Host apps can expose this through a small wrapper query so agents can run:
 *
 *   npx convex run featureRequests:chefAgentState '{}'
 *
 * The component itself is still host-controlled; this query only becomes part
 * of a public surface if the host chooses to wrap it.
 */
export const snapshot = query({
  args: {
    mode: v.optional(vMode),
    limit: v.optional(v.number()),
    includeCompleted: v.optional(v.boolean()),
  },
  returns: v.object({
    todos: v.array(v.any()),
    progress: v.array(v.any()),
    refinements: v.array(v.any()),
    requests: v.array(v.any()),
    counts: v.object({
      todos: v.number(),
      openTodos: v.number(),
      progress: v.number(),
      openRefinements: v.number(),
      requested: v.number(),
      inProgress: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    const mode = args.mode ?? "all";
    const limit = clampLimit(args.limit, 20, 100);
    const includeCompleted = args.includeCompleted ?? false;

    const todos =
      mode === "queue"
        ? []
        : await ctx.db.query("todos").withIndex("by_order").take(limit);
    todos.sort((a, b) => a.order - b.order);

    const progress =
      mode === "queue"
        ? []
        : await ctx.db.query("progressUpdates").order("desc").take(limit);

    const refinementsRaw =
      mode === "queue"
        ? []
        : await ctx.db
            .query("items")
            .withIndex("by_kind_and_state", (q) => q.eq("kind", "refinement"))
            .order("desc")
            .take(limit * 3);
    const refinements = refinementsRaw
      .filter((item) => includeCompleted || item.state !== "completed")
      .filter((item) => includeCompleted || item.state !== "rejected")
      .slice(0, limit);

    const queueStates: Array<"requested" | "inProgress"> = [
      "requested",
      "inProgress",
    ];
    const requestGroups = await Promise.all(
      queueStates.map(async (state) =>
        ctx.db
          .query("items")
          .withIndex("by_state", (q) => q.eq("state", state))
          .order("desc")
          .take(limit),
      ),
    );
    const requests = requestGroups
      .flat()
      .filter((item) => item.kind !== "refinement" && !item.mergedInto)
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, limit);

    return {
      todos,
      progress,
      refinements,
      requests,
      counts: {
        todos: todos.length,
        openTodos: todos.filter((todo) => todo.status !== "done").length,
        progress: progress.length,
        openRefinements: refinements.filter(
          (item) => item.state !== "completed" && item.state !== "rejected",
        ).length,
        requested: requests.filter((item) => item.state === "requested").length,
        inProgress: requests.filter((item) => item.state === "inProgress").length,
      },
    };
  },
});
