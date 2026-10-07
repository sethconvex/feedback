import {
  mutationGeneric,
  queryGeneric,
  type GenericMutationCtx,
  type GenericQueryCtx,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { Feedback, type ItemState } from "./client.js";

/**
 * `exposeChefApi` — the whole public surface the Chef clients (the `<chef-panel>`
 * web component in `panel/` and the iOS ChefKit package) talk to, as ready-made
 * Convex functions. The host writes ONE file:
 *
 *   // convex/chef.ts
 *   import { exposeChefApi } from "@convex-dev/feedback";
 *   import { components } from "./_generated/api";
 *   import { getAuthUserId } from "@convex-dev/auth/server";
 *   export const {
 *     agentState, listPublicItems, submitRequest, upvoteRequest, answerRefinement, skipRefinement,
 *     generateUploadUrl, submitRequestWithMedia, listAttachments,
 *     mine, amAdmin, awaitingApproval, review, whatsNew,
 *   } = exposeChefApi(components.feedback, { getUserId: getAuthUserId });
 *
 * Clients address the functions by module name (`chef:submitRequest`, …) — the
 * panel's `prefix` attribute / ChefKit's `prefix` — so the host may pick any name.
 *
 * `whatsNew({ since })` is the release-notes feed the clients pop up on launch:
 * completed requests with an admin-written changelog (`feedback.items.complete(ctx,
 * { itemId, changelog })`) that shipped after `since` (ms). Public: anyone, signed
 * in or not, may read it — it returns only the changelog line and ship time.
 *
 * Trust model (same as the rest of the component): identity always comes from
 * `getUserId(ctx)` (i.e. the caller's auth token), never from arguments. Writes
 * require a signed-in user (`ConvexError({ code: "UNAUTHENTICATED" })`);
 * queries return empty / false for signed-out callers. Admin-only surfaces
 * (approvals, build status, refinement answers) use the component's roles
 * (`users` table: the first registered user is the admin; promote more with
 * `feedback.users.setRole`).
 */

/** Anything with `auth` — a query or mutation ctx (mutation ctx is a superset). */
type AnyCtx = GenericQueryCtx<any>;

/** What `onSubmitted` receives after a request is filed. */
export type ChefSubmission = {
  itemId: string;
  userId: string;
  title: string;
  /** What the user typed (or dictated), without the context footer. */
  description: string;
  /** Voice-note transcript (client-side speech recognition), when there was one. */
  transcript?: string;
  /**
   * The item's resulting state: "requested" when an admin filed it (straight to
   * the build queue), "submitted" when it awaits an admin's approval.
   */
  state: ItemState;
  screenshotCount: number;
  hasAudio: boolean;
};

export type ChefApiOptions = {
  /**
   * Who is calling: the host's authenticated user id, or null when signed out.
   * `getAuthUserId` from `@convex-dev/auth/server` (2.0 alpha: `/core`) fits as-is; any
   * `(ctx) => Promise<string | null>` works (e.g. `ctx.auth.getUserIdentity()`'s subject).
   */
  getUserId: (ctx: AnyCtx) => Promise<string | null | undefined>;
  /**
   * Optional agent key (e.g. `() => process.env.FEEDBACK_AGENT_KEY`). Only ever
   * forwarded on behalf of a caller already verified to be an admin; never
   * grants anything to ordinary users.
   */
  agentKey?: () => string | undefined;
  /**
   * Called (inside the submitting mutation) after a request is created and its
   * attachments are stored. Typical use: email admins when
   * `state === "submitted"` (a request waiting for approval). Throwing rolls
   * the whole submission back, so schedule slow work with `ctx.scheduler`.
   */
  onSubmitted?: (
    ctx: GenericMutationCtx<any>,
    submission: ChefSubmission,
  ) => Promise<void> | void;
  /**
   * Optional display name for "from" in the approvals list (e.g. a username
   * lookup). Defaults to null (clients show "Someone").
   */
  getUserName?: (ctx: AnyCtx, userId: string) => Promise<string | null>;
  /**
   * Show pre-triage ("submitted") requests on the public list and make their
   * media readable like the board (community/dedup board). Default false: only
   * approved requests are public; requesters always see their own.
   */
  includeCommunity?: boolean;
  /**
   * Register signed-in callers with the component on their first write
   * (`users.ensure`; the very first user becomes the admin). Default true. Turn
   * off if your app calls `feedback.users.ensure` itself after sign-in.
   */
  autoRegister?: boolean;
};

const MAX_SCREENSHOTS = 4;
const MAX_TITLE = 200;
const MAX_TEXT = 8000;

const vAttachmentKind = v.union(v.literal("screenshot"), v.literal("audio"));
const vItemState = v.union(
  v.literal("submitted"),
  v.literal("requested"),
  v.literal("planned"),
  v.literal("inProgress"),
  v.literal("rejected"),
  v.literal("completed"),
);

// The public board shows a coarse status; the panel speaks raw states.
const STATE_FOR_PUBLIC_STATUS: Record<string, ItemState> = {
  community: "submitted",
  planned: "requested",
  building: "inProgress",
  shipped: "completed",
};

function unauthenticated(): never {
  throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not signed in: sign in to use Chef" });
}
function badRequest(message: string): never {
  throw new ConvexError({ code: "BAD_REQUEST", message });
}
function forbidden(message: string): never {
  throw new ConvexError({ code: "FORBIDDEN", message });
}

// Component errors are plain Errors ("Uncaught Error: At most 4 screenshots…" plus a
// stack); surface their first line as a clean, client-readable message.
function cleanMessage(e: unknown): string {
  return String((e as Error)?.message ?? e)
    .replace(/^[\s\S]*?Uncaught Error: /, "")
    .split("\n")[0];
}

/**
 * Build the Chef public API on top of the feedback component. Destructure the
 * result into named exports of one Convex module (see the file comment).
 */
export function exposeChefApi(component: any, options: ChefApiOptions) {
  const feedback = new Feedback(component);
  const agentKey = () => options.agentKey?.();
  const includeCommunity = options.includeCommunity ?? false;

  const userIdOf = async (ctx: AnyCtx): Promise<string | null> =>
    (await options.getUserId(ctx)) ?? null;

  const requireUser = async (ctx: GenericMutationCtx<any>): Promise<string> => {
    const userId = await userIdOf(ctx);
    if (!userId) unauthenticated();
    if (options.autoRegister ?? true) await feedback.users.ensure(ctx, { userId });
    return userId;
  };

  const isAdmin = async (ctx: AnyCtx, userId: string | null) => {
    if (!userId) return false;
    const u = await feedback.users.get(ctx, { userId });
    return u?.role === "admin";
  };

  // Refinement answers are build chrome: the same audience that sees build
  // status (admins, or anyone while nobody has registered yet).
  const requireBuildAudience = async (ctx: GenericMutationCtx<any>, userId: string | null) => {
    if (await isAdmin(ctx, userId)) return;
    if ((await feedback.users.count(ctx)) === 0) return;
    forbidden("Only the app's admins can answer Chef's questions");
  };

  const requireRefinement = async (ctx: AnyCtx, id: string) => {
    let item: any = null;
    try {
      item = await feedback.items.get(ctx, { itemId: id as any });
    } catch {
      // malformed id
    }
    if (!item || item.kind !== "refinement") badRequest("Unknown question");
    return item;
  };

  /** Create the item, attach media, then tell the host. Shared by both submit paths. */
  const fileRequest = async (
    ctx: GenericMutationCtx<any>,
    userId: string,
    a: {
      title: string;
      description?: string;
      transcript?: string;
      screenshotStorageIds?: string[];
      audioStorageId?: string;
      context?: { screen?: string; ref?: string };
    },
  ): Promise<{ itemId: string; state: ItemState }> => {
    const title = a.title.trim().slice(0, MAX_TITLE);
    if (!title) badRequest("A title is required");
    const shots = a.screenshotStorageIds ?? [];
    if (shots.length > MAX_SCREENSHOTS) badRequest(`At most ${MAX_SCREENSHOTS} screenshots`);
    if (new Set(shots).size !== shots.length) badRequest("Duplicate screenshot");
    if (a.audioStorageId && shots.includes(a.audioStorageId)) badRequest("Duplicate upload");

    const typed = (a.description ?? "").trim().slice(0, MAX_TEXT);
    const transcript = a.transcript?.trim().slice(0, MAX_TEXT) || undefined;
    // Where the user was when they asked, as a footer the build agent can read.
    const bits = [
      a.context?.screen?.trim() ? `screen: ${a.context.screen.trim().slice(0, 120)}` : null,
      a.context?.ref?.trim() ? `ref: ${a.context.ref.trim().slice(0, 200)}` : null,
    ].filter(Boolean);
    const description = (bits.length ? `${typed}\n\n_${bits.join(" · ")}_` : typed).trim();

    // autoApprove only takes effect for component admins (enforced by the
    // component); everyone else's request lands in "submitted" for approval.
    const itemId = String(
      await feedback.items.create(ctx, { userId, title, description, transcript, autoApprove: true }),
    );
    try {
      for (const storageId of shots) {
        await feedback.attachments.add(ctx, { itemId, kind: "screenshot", storageId, userId });
      }
      if (a.audioStorageId) {
        await feedback.attachments.add(ctx, { itemId, kind: "audio", storageId: a.audioStorageId, userId });
      }
    } catch (e) {
      // The whole mutation (including the item insert) rolls back.
      badRequest(cleanMessage(e));
    }
    const item: any = await feedback.items.get(ctx, { itemId: itemId as any });
    const state: ItemState = item?.state ?? "submitted";
    if (options.onSubmitted) {
      await options.onSubmitted(ctx, {
        itemId,
        userId,
        title,
        description: typed,
        transcript,
        state,
        screenshotCount: shots.length,
        hasAudio: !!a.audioStorageId,
      });
    }
    return { itemId, state };
  };

  // ------------------------------------------------------------------ queries

  /** Build status for the panel: todos, progress feed, open questions (admins only once users exist). */
  const agentState = queryGeneric({
    args: {},
    returns: v.object({
      todos: v.array(v.any()),
      progress: v.array(v.any()),
      refinements: v.array(v.any()),
    }),
    handler: async (ctx) => {
      const viewer = await userIdOf(ctx);
      const s: any = await feedback.agentState.snapshot(ctx, { viewer });
      return { todos: s.todos, progress: s.progress, refinements: s.refinements };
    },
  });

  /** The public board (approved requests, plus pre-triage ones with `includeCommunity`). */
  const listPublicItems = queryGeneric({
    args: { limit: v.optional(v.number()) },
    returns: v.array(
      v.object({
        _id: v.string(),
        number: v.number(),
        title: v.string(),
        description: v.string(),
        state: vItemState,
        voteCount: v.number(),
      }),
    ),
    handler: async (ctx, a) => {
      const r: any = await feedback.items.listPublic(ctx, { limit: a.limit ?? 20, includeCommunity });
      return (r.page ?? []).map((i: any) => ({
        _id: String(i._id),
        number: i.number,
        title: i.title,
        description: i.description,
        state: STATE_FOR_PUBLIC_STATUS[i.publicStatus] ?? "requested",
        voteCount: i.voteCount ?? 0,
      }));
    },
  });

  /** Screenshots / voice notes of up to 50 items, filtered by each item's read rules. */
  const listAttachments = queryGeneric({
    args: { itemId: v.optional(v.string()), itemIds: v.optional(v.array(v.string())) },
    returns: v.array(
      v.object({
        itemId: v.string(),
        attachments: v.array(
          v.object({ kind: vAttachmentKind, url: v.union(v.string(), v.null()), mimeType: v.string() }),
        ),
      }),
    ),
    handler: async (ctx, a) => {
      const ids = [...(a.itemId ? [a.itemId] : []), ...(a.itemIds ?? [])].slice(0, 50);
      if (!ids.length) return [];
      const viewer = await userIdOf(ctx);
      let rows;
      try {
        rows = await feedback.attachments.listForItems(ctx, { itemIds: ids, viewer, includeCommunity });
      } catch {
        badRequest("Unknown request id");
      }
      return rows.map((r) => ({
        itemId: String(r.itemId),
        attachments: r.attachments.map((x) => ({ kind: x.kind, url: x.url, mimeType: x.mimeType })),
      }));
    },
  });

  /** The caller's own requests, newest first (≤50). [] when signed out. */
  const mine = queryGeneric({
    args: {},
    returns: v.array(
      v.object({
        _id: v.string(),
        title: v.string(),
        state: vItemState,
        _creationTime: v.number(),
        hasAudio: v.boolean(),
        screenshotCount: v.number(),
      }),
    ),
    handler: async (ctx) => {
      const userId = await userIdOf(ctx);
      if (!userId) return [];
      const rows = await feedback.items.listByCreator(ctx, { userId, limit: 50 });
      return rows.map((r) => ({
        _id: String(r._id),
        title: r.title,
        state: r.state,
        _creationTime: r._creationTime,
        hasAudio: r.hasAudio,
        screenshotCount: r.screenshotCount,
      }));
    },
  });

  /** Whether the caller is a component admin (sees approvals + build status). */
  const amAdmin = queryGeneric({
    args: {},
    returns: v.boolean(),
    handler: async (ctx) => await isAdmin(ctx, await userIdOf(ctx)),
  });

  /** Requests from non-admins waiting for an admin, with media. [] for non-admins. */
  const awaitingApproval = queryGeneric({
    args: {},
    returns: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        description: v.string(),
        from: v.union(v.string(), v.null()),
        at: v.number(),
        attachments: v.array(v.object({ kind: vAttachmentKind, url: v.union(v.string(), v.null()) })),
      }),
    ),
    handler: async (ctx) => {
      const me = await userIdOf(ctx);
      if (!me || !(await isAdmin(ctx, me))) return [];
      const page: any[] = await feedback.items.listAwaitingApproval(ctx, { viewer: me, limit: 50 });
      const media = page.length
        ? await feedback.attachments.listForItems(ctx, {
            itemIds: page.map((i) => i._id),
            viewer: me,
            agentKey: agentKey(),
          })
        : [];
      const byItem = new Map(media.map((m) => [String(m.itemId), m.attachments]));
      return await Promise.all(
        page.map(async (i) => ({
          id: String(i._id),
          title: String(i.title ?? ""),
          description: String(i.description ?? "").slice(0, 2000),
          from: i.createdBy && options.getUserName ? await options.getUserName(ctx, String(i.createdBy)) : null,
          at: Number(i._creationTime),
          attachments: (byItem.get(String(i._id)) ?? []).map((x) => ({ kind: x.kind, url: x.url ?? null })),
        })),
      );
    },
  });

  /**
   * Release notes: what shipped after `since` (ms epoch), newest first (≤50).
   * Public — only the admin-written changelog line and ship time are returned.
   */
  const whatsNew = queryGeneric({
    args: { since: v.number() },
    returns: v.array(v.object({ id: v.string(), text: v.string(), at: v.number() })),
    handler: async (ctx, a) => {
      const since = Number.isFinite(a.since) ? a.since : 0;
      const rows = await feedback.items.listShippedSince(ctx, { since, limit: 50 });
      return rows.map((r) => ({ id: String(r._id), text: r.changelog, at: r.completedAt }));
    },
  });

  // ---------------------------------------------------------------- mutations

  /** Upload URL (component storage) for one screenshot or voice note. Signed-in only. */
  const generateUploadUrl = mutationGeneric({
    args: {},
    returns: v.string(),
    handler: async (ctx) => {
      await requireUser(ctx);
      return await feedback.attachments.generateUploadUrl(ctx);
    },
  });

  /** File a text-only request. */
  const submitRequest = mutationGeneric({
    args: { title: v.string(), description: v.optional(v.string()) },
    returns: v.null(),
    handler: async (ctx, a) => {
      const userId = await requireUser(ctx);
      await fileRequest(ctx, userId, a);
      return null;
    },
  });

  /**
   * File a request with up to 4 screenshots and/or one voice note (uploaded via
   * generateUploadUrl first). `transcript` is the client's speech-to-text.
   */
  const submitRequestWithMedia = mutationGeneric({
    args: {
      title: v.string(),
      description: v.optional(v.string()),
      transcript: v.optional(v.string()),
      screenshotStorageIds: v.array(v.string()),
      audioStorageId: v.optional(v.string()),
      context: v.optional(v.object({ screen: v.optional(v.string()), ref: v.optional(v.string()) })),
    },
    returns: v.object({ itemId: v.string() }),
    handler: async (ctx, a) => {
      const userId = await requireUser(ctx);
      const { itemId } = await fileRequest(ctx, userId, a);
      return { itemId };
    },
  });

  /** +1 a request on the public board (one vote per user; repeat calls are no-ops). */
  const upvoteRequest = mutationGeneric({
    args: { id: v.string() },
    returns: v.null(),
    handler: async (ctx, a) => {
      const userId = await requireUser(ctx);
      try {
        await feedback.bids.place(ctx, { userId, itemId: a.id as any, amount: 1 });
      } catch (e) {
        badRequest(cleanMessage(e));
      }
      return null;
    },
  });

  /** Answer one of Chef's clarifying questions (admins, or anyone before the first user). */
  const answerRefinement = mutationGeneric({
    args: { id: v.string(), answer: v.string() },
    returns: v.null(),
    handler: async (ctx, a) => {
      const userId = await userIdOf(ctx);
      await requireBuildAudience(ctx, userId);
      const answer = a.answer.trim().slice(0, MAX_TEXT);
      if (!answer) badRequest("An answer is required");
      const q = await requireRefinement(ctx, a.id);
      await feedback.devLogs.post(ctx, { itemId: q._id, authorId: userId ?? "owner", message: answer });
      return null;
    },
  });

  /** Skip one of Chef's clarifying questions. Same audience as answerRefinement. */
  const skipRefinement = mutationGeneric({
    args: { id: v.string() },
    returns: v.null(),
    handler: async (ctx, a) => {
      await requireBuildAudience(ctx, await userIdOf(ctx));
      const q = await requireRefinement(ctx, a.id);
      await feedback.items.transitionState(ctx, { itemId: q._id, state: "rejected" });
      return null;
    },
  });

  /** Admin: approve (→ build queue) or reject a request awaiting approval. */
  const review = mutationGeneric({
    args: { id: v.string(), approve: v.boolean() },
    returns: v.null(),
    handler: async (ctx, a) => {
      const me = await userIdOf(ctx);
      if (!me) unauthenticated();
      if (!(await isAdmin(ctx, me))) forbidden("Only admins can approve or reject requests");
      try {
        await feedback.items.review(ctx, { itemId: a.id as any, approve: a.approve, reviewerId: me });
      } catch (e) {
        badRequest(cleanMessage(e));
      }
      return null;
    },
  });

  return {
    agentState,
    listPublicItems,
    submitRequest,
    upvoteRequest,
    answerRefinement,
    skipRefinement,
    generateUploadUrl,
    submitRequestWithMedia,
    listAttachments,
    mine,
    amAdmin,
    awaitingApproval,
    review,
    whatsNew,
  };
}
