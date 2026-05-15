import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const vState = v.union(
  v.literal("submitted"),
  v.literal("requested"),
  v.literal("planned"),
  v.literal("inProgress"),
  v.literal("rejected"),
  v.literal("completed"),
);

export const vNotificationType = v.union(
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("stateChanged"),
  v.literal("completed"),
  v.literal("merged"),
  v.literal("devLog"),
);

export default defineSchema({
  items: defineTable({
    number: v.number(),
    title: v.string(),
    description: v.string(),
    state: vState,
    createdBy: v.string(),
    completedAt: v.optional(v.number()),
    mergedInto: v.optional(v.id("items")),
    // "feature" (default) for normal requests; "refinement" for agent-asked
    // clarifying questions that use devLogs as the answer thread.
    kind: v.optional(v.union(v.literal("feature"), v.literal("refinement"))),
    // Denormalized stats — updated atomically inside bid mutations so reads
    // never have to join on the bids table. Optional for documents that
    // predate this migration.
    totalAmount: v.optional(v.number()),
    supporterCount: v.optional(v.number()),
  })
    .index("by_state", ["state"])
    .index("by_createdBy", ["createdBy"])
    .index("by_number", ["number"])
    .index("by_kind_and_state", ["kind", "state"]),

  bids: defineTable({
    itemId: v.id("items"),
    userId: v.string(),
    amount: v.number(),
  })
    .index("by_item", ["itemId"])
    .index("by_user", ["userId"])
    .index("by_item_and_user", ["itemId", "userId"]),

  devLogs: defineTable({
    itemId: v.id("items"),
    authorId: v.string(),
    message: v.string(),
    stamp: v.number(),
  }).index("by_item", ["itemId"]),

  notifications: defineTable({
    userId: v.string(),
    itemId: v.id("items"),
    type: vNotificationType,
    message: v.string(),
    isRead: v.boolean(),
    stamp: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_read", ["userId", "isRead"]),

  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),

  agentKeys: defineTable({
    name: v.string(),
    key: v.string(),
    createdBy: v.string(),
    lastUsedAt: v.optional(v.number()),
    revoked: v.boolean(),
  }).index("by_key", ["key"]),

  // ----------- wow-shell mechanisms (build-mode UX, optional in prod) -----------
  //
  // Refinement questions reuse `items` (with kind="refinement") + `devLogs`
  // (as the answer thread) — no new table needed. See README "Refinement
  // questions" section.

  // Agent-planned checklist the user sees fill in as work progresses.
  // One row per item, ordered. Three states: pending / active / done.
  todos: defineTable({
    text: v.string(),
    order: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("done"),
    ),
  }).index("by_order", ["order"]),

  // Free-form agent progress feed (separate from per-item devLogs).
  // Latest N rows render at the top of the floating Chef bubble.
  progressUpdates: defineTable({
    message: v.string(),
    kind: v.union(
      v.literal("step"),
      v.literal("shipped"),
      v.literal("note"),
    ),
  }),
});
