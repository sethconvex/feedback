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

## Trust model

The component never reads `ctx.auth`. Every mutation takes a `userId: string` arg — the host authenticates first, then forwards a trusted ID. Works with any auth provider.

## Agent API

Install HTTP routes in one line:

```ts
import { mountAgentRoutes } from "@convex-dev/feedback/http";
mountAgentRoutes(http, components.feedback);
```

Then issue bearer tokens in the admin UI and paste agent prompts into Claude / Cursor / Codex.
