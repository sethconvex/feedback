# @convex-dev/feedback

Embeddable feature-request & voting backend as a [Convex component](https://docs.convex.dev/components).

Drop a feature-request workflow into any Convex app with one line in your `convex.config.ts`.

## Packages

- **Root** (`@convex-dev/feedback`) — the Convex component: items, bids, devLogs, notifications, agentKeys, HTTP agent routes.
- **`react/`** (`@convex-dev/feedback-react`) — prebuilt React widgets: `FeatureRequestButton`, `FeatureRequestList`, `FeatureRequestDetail`, `AdminPanel`, `NotificationBell`.

## Quick start

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import feedback from "@convex-dev/feedback/convex.config";

const app = defineApp();
app.use(feedback);
export default app;
```

```ts
// convex/featureRequests.ts
import { components } from "./_generated/api";
import { Feedback } from "@convex-dev/feedback";

const feedback = new Feedback(components.feedback);

// Wrap with your own auth — the component never calls ctx.auth.
export const submit = mutation({
  args: { title: v.string(), description: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx); // your auth
    return await feedback.items.create(ctx, { userId, ...args });
  },
});
```

## Refinement questions

Agents can ask clarifying questions through the same `items` + `devLogs`
mechanism — just pass `kind: "refinement"` on create. The user's answer
is posted back as a devLog on the item.

```ts
// Agent: ask
const qId = await feedback.items.create(ctx, {
  userId: "agent",
  title: "What kind of auth?",
  description: "Email/password, magic links, or social?",
  kind: "refinement",
  autoApprove: true,
});

// User UI: answer by posting a devLog
await feedback.devLogs.post(ctx, { itemId: qId, authorId: userId, message: "magic links" });

// Agent: watch for an answer
const open = await feedback.items.listRefinementOpen(ctx);
const replies = await feedback.devLogs.listForItem(ctx, { itemId: qId });
```

Refinement items are filtered out of `items.listPublic` so they never pollute
the feature-request feed.

## Build-mode UI (todos + progress)

Two optional tables power a build-mode "watching the agent" UX:

- `feedback.todos.plan({ items })` / `.advance()` / `.listAll()` — checklist
  the agent fills in as work progresses.
- `feedback.progress.post({ message, kind })` / `.listRecent()` — free-form
  feed of agent updates (`"step" | "shipped" | "note"`).
- `feedback.agentState.snapshot({ mode, limit })` — a CLI-friendly read model
  of todos, progress, refinement questions, and requested/in-progress work.
  Hosts can expose it with a tiny wrapper query so coding agents can inspect
  Chef state with `npx convex run`, without requiring browser auth:

```ts
export const chefAgentState = query({
  args: { limit: v.optional(v.number()) },
  handler: (ctx, args) => feedback.agentState.snapshot(ctx, args),
});
```

Both are unused in production deployments — feel free to ignore them.

### `ChefPanel` widget

`@convex-dev/feedback-react` ships a `ChefPanel` — a floating bubble with
three tabs (Building / Asking / Request) that renders todos, refinement
questions, the progress feed, and feature requests. Like the other
widgets it's host-agnostic: pass your own wrapper-function refs.

```tsx
import { ChefPanel } from "@convex-dev/feedback-react";
import { api } from "./convex/_generated/api";

// Your host exposes a wrapper module (the wow-shell convention is
// `convex/wow.ts`) with these public functions:
<ChefPanel
  api={{
    listOpenRefinements: api.wow.listOpenRefinements,
    answerRefinement: api.wow.answerRefinement,
    skipRefinement: api.wow.skipRefinement,
    listPublicItems: api.wow.listPublicItems,
    submitRequest: api.wow.submitRequest,
    upvoteRequest: api.wow.upvoteRequest,
    listProgress: api.wow.listProgress,
    listTodos: api.wow.listTodos,
  }}
/>
```

## Attachments (screenshots + voice notes)

Items can carry up to **4 screenshots** (`image/*`, ≤10 MB each) and **1 voice
note** (`audio/*` or `video/mp4`, ≤25 MB). Files live in the component's own
file storage, are deleted by `items.remove`, and move to the target on
`items.merge`. A voice-note transcript is stored on the item as `transcript`
(separate from the editable `description`).

```ts
// convex/wow.ts (host) — auth first, then forward a trusted userId
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await feedback.attachments.generateUploadUrl(ctx);
  },
});

export const submitRequestWithMedia = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    transcript: v.optional(v.string()),
    screenshotStorageIds: v.array(v.string()),
    audioStorageId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const userId = await requireUserId(ctx);
    const itemId = await feedback.items.create(ctx, {
      userId, title: a.title, description: a.description ?? "", transcript: a.transcript,
    });
    for (const storageId of a.screenshotStorageIds)
      await feedback.attachments.add(ctx, { itemId, kind: "screenshot", storageId, userId });
    if (a.audioStorageId)
      await feedback.attachments.add(ctx, { itemId, kind: "audio", storageId: a.audioStorageId, userId });
    return itemId;
  },
});

export const listAttachments = query({
  args: { itemId: v.string() },
  handler: async (ctx, a) =>
    feedback.attachments.list(ctx, { itemId: a.itemId, viewer: await getUserId(ctx) }),
});
```

Client upload: `POST` the Blob to the URL with its `Content-Type` header set;
the response is `{ storageId }`. `add` validates type, size, per-item caps, that
the upload is under an hour old, and that it isn't already attached. Uploads
that are never attached stay in component storage (sweep them if that matters).

**Who can read attachments:** the same audience as the item — admins/agents,
the item's creator (`viewer`), and anyone while the item is on the public board
(`items.listPublic` rules; pre-triage items count as public per
`settings.communityBoardVisible`, or per the `includeCommunity` you pass to
`attachments.list` — pass the same value you give `items.listPublic`). Screenshots
can contain private data, so consider turning off `communityBoardVisible` for
apps where pre-triage requests shouldn't be public. The agent HTTP queue
(`GET /agent/queue`) inlines `attachments: [{ kind, url, mimeType }]` per item.

## Approvals (members' requests)

Only admins' requests go straight to the build queue (`autoApprove` is ignored for everyone else);
members' requests wait in `submitted`. Give admins a place to approve them:

```ts
// convex/chef.ts (host)
export const awaitingApproval = query({
  args: {},
  handler: async (ctx) => {
    const me = await getAuthUserId(ctx);
    if (!me) return [];
    const items = await feedback.items.listAwaitingApproval(ctx, { viewer: me }).catch(() => []);
    // + feedback.attachments.listForItems(ctx, { itemIds, viewer: me }) for screenshots / voice notes
    return items.map((i) => ({ id: i._id, title: i.title, description: i.description, from: null, at: i._creationTime, attachments: [] }));
  },
});
export const review = mutation({
  args: { id: v.string(), approve: v.boolean() },
  handler: async (ctx, { id, approve }) =>
    feedback.items.review(ctx, { itemId: id as any, approve, reviewerId: (await getAuthUserId(ctx))! }),
});
```

```tsx
import { ApprovalQueue } from "@convex-dev/feedback/react";
<ApprovalQueue api={{ list: api.chef.awaitingApproval, review: api.chef.review }} />
```

`review` checks the reviewer is an admin, moves `submitted` → `requested` (approve) or `rejected`,
and notifies the requester. To tell admins a request is waiting (e.g. by email), check the new
item's state after `items.create` and message `feedback.users.listAdmins(ctx)`:

```ts
const itemId = await feedback.items.create(ctx, { userId, title, description, autoApprove: true });
if ((await feedback.items.get(ctx, { itemId }))?.state === "submitted") {
  for (const adminId of await feedback.users.listAdmins(ctx)) { /* email / push them */ }
}
```

## Trust model

The component never reads `ctx.auth`. Every mutation takes a `userId: string` arg — the host authenticates first, then forwards a trusted ID. Works with any auth provider.

## Agent API

Install HTTP routes in one line:

```ts
import { mountAgentRoutes } from "@convex-dev/feedback/http";
mountAgentRoutes(http, components.feedback);
```

Then issue bearer tokens in the admin UI and paste agent prompts into Claude / Cursor / Codex.
