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
    // Denormalized stats — updated atomically inside bid mutations so reads
    // never have to join on the bids table. Optional for documents that
    // predate this migration.
    totalAmount: v.optional(v.number()),
    supporterCount: v.optional(v.number()),
  })
    .index("by_state", ["state"])
    .index("by_createdBy", ["createdBy"])
    .index("by_number", ["number"]),

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
});
