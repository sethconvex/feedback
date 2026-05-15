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
import { Ship } from "@convex-dev/feedback";

const ship = new Ship(components.feedback);

// Wrap with your own auth — the component never calls ctx.auth.
export const submit = mutation({
  args: { title: v.string(), description: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx); // your auth
    return await ship.items.create(ctx, { userId, ...args });
  },
});
```

See the [ship repo](https://github.com/get-convex/ship) for full examples (`example/` and `theseus/`).

## Refinement questions

Agents can ask clarifying questions through the same `items` + `devLogs`
mechanism — just pass `kind: "refinement"` on create. The user's answer
is posted back as a devLog on the item.

```ts
// Agent: ask
const qId = await ship.items.create(ctx, {
  userId: "agent",
  title: "What kind of auth?",
  description: "Email/password, magic links, or social?",
  kind: "refinement",
  autoApprove: true,
});

// User UI: answer by posting a devLog
await ship.devLogs.post(ctx, { itemId: qId, authorId: userId, message: "magic links" });

// Agent: watch for an answer
const open = await ship.items.listRefinementOpen(ctx);
const replies = await ship.devLogs.listForItem(ctx, { itemId: qId });
```

Refinement items are filtered out of `items.listPublic` so they never pollute
the feature-request feed.

## Build-mode UI (todos + progress)

Two optional tables power a build-mode "watching the agent" UX:

- `ship.todos.plan({ items })` / `.advance()` / `.listAll()` — checklist
  the agent fills in as work progresses.
- `ship.progress.post({ message, kind })` / `.listRecent()` — free-form
  feed of agent updates (`"step" | "shipped" | "note"`).

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

## Trust model

The component never reads `ctx.auth`. Every mutation takes a `userId: string` arg — the host authenticates first, then forwards a trusted ID. Works with any auth provider.

## Agent API

Install HTTP routes in one line:

```ts
import { mountAgentRoutes } from "@convex-dev/feedback/http";
mountAgentRoutes(http, components.feedback);
```

Then issue bearer tokens in the admin UI and paste agent prompts into Claude / Cursor / Codex.
