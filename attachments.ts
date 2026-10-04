import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { canReadItem, isPrivileged, resolveActor } from "./access";

// Screenshots + voice notes attached to feedback items.
//
// Flow (host-side wrappers do the auth, as everywhere in this component):
//   1. url = await feedback.attachments.generateUploadUrl(ctx)
//   2. client POSTs the file to `url` (Content-Type must be set) → { storageId }
//   3. await feedback.attachments.add(ctx, { itemId, kind, storageId, userId })
//
// Files live in the component's own storage, so they are deleted with the item
// and only readable through `list` (which applies the item's visibility rules).

export const LIMITS = {
  maxScreenshots: 4,
  maxAudio: 1,
  maxScreenshotBytes: 10 * 1024 * 1024,
  maxAudioBytes: 25 * 1024 * 1024,
  // An upload must be attached within this window (prevents attaching some
  // long-lived blob that happens to sit in component storage).
  freshMs: 60 * 60 * 1000,
};

export const vAttachmentKind = v.union(
  v.literal("screenshot"),
  v.literal("audio"),
);

const vActorArgs = {
  viewer: v.optional(v.union(v.string(), v.null())),
  agentKey: v.optional(v.string()),
  // Whether pre-triage ("submitted") items count as public. Defaults to the
  // owner's settings.communityBoardVisible; pass the same value you give
  // items.listPublic so attachment visibility matches your board.
  includeCommunity: v.optional(v.boolean()),
};

const vAttachmentOut = v.object({
  _id: v.id("attachments"),
  kind: vAttachmentKind,
  url: v.union(v.string(), v.null()),
  mimeType: v.string(),
  size: v.number(),
  createdAt: v.number(),
});

function mimeOk(kind: "screenshot" | "audio", type: string): boolean {
  const t = type.toLowerCase().split(";")[0].trim();
  if (kind === "screenshot") return t.startsWith("image/");
  return t.startsWith("audio/") || t === "video/mp4" || t === "video/webm";
}

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const add = mutation({
  args: {
    itemId: v.id("items"),
    kind: vAttachmentKind,
    storageId: v.id("_storage"),
    // The (host-authenticated) uploader. Must be the item's creator unless the
    // forwarded actor is an admin/agent.
    userId: v.string(),
    agentKey: v.optional(v.string()),
  },
  returns: v.id("attachments"),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    if (item.mergedInto) throw new Error("Item was merged");
    if (item.createdBy !== args.userId) {
      const actor = await resolveActor(ctx, {
        viewer: args.userId,
        agentKey: args.agentKey,
      });
      if (!isPrivileged(actor)) {
        throw new Error("Unauthorized: only the requester can attach files");
      }
    }

    const file = await ctx.db.system.get(args.storageId);
    if (!file) throw new Error("Upload not found");
    if (Date.now() - file._creationTime > LIMITS.freshMs) {
      throw new Error("Upload expired; please attach it again");
    }
    const mimeType = file.contentType ?? "";
    if (!mimeType || !mimeOk(args.kind, mimeType)) {
      throw new Error(
        args.kind === "screenshot"
          ? "Screenshots must be images (image/*)"
          : "Voice notes must be audio (audio/* or video/mp4)",
      );
    }
    const max =
      args.kind === "screenshot"
        ? LIMITS.maxScreenshotBytes
        : LIMITS.maxAudioBytes;
    if (file.size > max) {
      throw new Error(
        `${args.kind === "screenshot" ? "Screenshot" : "Voice note"} is too large (max ${Math.round(max / 1024 / 1024)} MB)`,
      );
    }
    const reused = await ctx.db
      .query("attachments")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
    if (reused) throw new Error("That upload is already attached");

    const existing = await ctx.db
      .query("attachments")
      .withIndex("by_itemId", (q) => q.eq("itemId", args.itemId))
      .take(LIMITS.maxScreenshots + LIMITS.maxAudio + 1);
    const sameKind = existing.filter((a) => a.kind === args.kind).length;
    const cap =
      args.kind === "screenshot" ? LIMITS.maxScreenshots : LIMITS.maxAudio;
    if (sameKind >= cap) {
      throw new Error(
        args.kind === "screenshot"
          ? `At most ${cap} screenshots per request`
          : `At most ${cap} voice note per request`,
      );
    }

    return await ctx.db.insert("attachments", {
      itemId: args.itemId,
      kind: args.kind,
      storageId: args.storageId,
      mimeType,
      size: file.size,
      createdAt: Date.now(),
      uploadedBy: args.userId,
    });
  },
});

async function listFor(ctx: QueryCtx, itemId: Id<"items">) {
  const rows = await ctx.db
    .query("attachments")
    .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
    .take(LIMITS.maxScreenshots + LIMITS.maxAudio + 4);
  return await Promise.all(
    rows.map(async (a) => ({
      _id: a._id,
      kind: a.kind,
      url: await ctx.storage.getUrl(a.storageId),
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt,
    })),
  );
}

/**
 * Attachments of one item, with fresh URLs. Readable by exactly who may read
 * the item: admins/agents, its creator (`viewer`), or anyone while the item is
 * on the public board. Unreadable/missing items return [] (no existence leak).
 */
export const list = query({
  args: { itemId: v.id("items"), ...vActorArgs },
  returns: v.array(vAttachmentOut),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || !(await canReadItem(ctx, item, args))) return [];
    return await listFor(ctx, args.itemId);
  },
});

/** Batch form of `list` for item lists (≤50 ids); one entry per readable item. */
export const listForItems = query({
  args: { itemIds: v.array(v.id("items")), ...vActorArgs },
  returns: v.array(
    v.object({ itemId: v.id("items"), attachments: v.array(vAttachmentOut) }),
  ),
  handler: async (ctx, args) => {
    const out = [];
    for (const itemId of args.itemIds.slice(0, 50)) {
      const item = await ctx.db.get(itemId);
      if (!item || !(await canReadItem(ctx, item, args))) continue;
      const attachments = await listFor(ctx, itemId);
      if (attachments.length) out.push({ itemId, attachments });
    }
    return out;
  },
});

/** Remove one attachment (and its file). Requester or admin/agent only. */
export const remove = mutation({
  args: {
    attachmentId: v.id("attachments"),
    userId: v.string(),
    agentKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.attachmentId);
    if (!a) return null;
    const item = await ctx.db.get(a.itemId);
    if (item?.createdBy !== args.userId) {
      const actor = await resolveActor(ctx, {
        viewer: args.userId,
        agentKey: args.agentKey,
      });
      if (!isPrivileged(actor)) throw new Error("Unauthorized");
    }
    await ctx.storage.delete(a.storageId);
    await ctx.db.delete(a._id);
    return null;
  },
});

// ---- helpers used by items.remove / items.merge ----

export async function deleteAttachmentsForItem(
  ctx: MutationCtx,
  itemId: Id<"items">,
) {
  const rows: Doc<"attachments">[] = await ctx.db
    .query("attachments")
    .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
    .collect();
  for (const a of rows) {
    await ctx.storage.delete(a.storageId);
    await ctx.db.delete(a._id);
  }
}

// A merged item's screenshots/voice notes are still evidence for the target
// request, so they move with the votes rather than being deleted.
export async function moveAttachments(
  ctx: MutationCtx,
  fromId: Id<"items">,
  toId: Id<"items">,
) {
  const rows: Doc<"attachments">[] = await ctx.db
    .query("attachments")
    .withIndex("by_itemId", (q) => q.eq("itemId", fromId))
    .collect();
  for (const a of rows) await ctx.db.patch(a._id, { itemId: toId });
}
