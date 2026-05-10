/**
 * HTTP route helper for hosting Ship's agent API.
 *
 * Usage in the host's convex/http.ts:
 *
 *   import { httpRouter } from "convex/server";
 *   import { components } from "./_generated/api";
 *   import { mountAgentRoutes } from "@convex-dev/ship/http";
 *
 *   const http = httpRouter();
 *   mountAgentRoutes(http, components.ship);
 *   export default http;
 *
 * Components can't own HTTP routes themselves — the public URL surface
 * always belongs to the host — so this helper installs handlers that use
 * the component's own tables and functions under the covers.
 */
import { httpActionGeneric, type HttpRouter } from "convex/server";

type ShipApi = any;
type ItemState =
  | "submitted"
  | "requested"
  | "planned"
  | "inProgress"
  | "rejected"
  | "completed";

const AGENT_USER_PREFIX = "agent:";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

export type MountAgentRoutesOptions = {
  /** URL prefix for routes. Default "/agent". */
  prefix?: string;
  /** Override CORS origin (default "*"). */
  corsOrigin?: string;
};

export function mountAgentRoutes(
  http: HttpRouter,
  component: ShipApi,
  opts: MountAgentRoutesOptions = {},
) {
  const prefix = opts.prefix ?? "/agent";

  async function verify(
    ctx: any,
    req: Request,
  ): Promise<{ agentId: string; keyId: string } | Response> {
    const header = req.headers.get("authorization") ?? "";
    const match = header.match(/^Bearer\s+(\S+)$/i);
    if (!match) return json({ error: "Missing Bearer token" }, 401);
    const record = await ctx.runQuery(component.agentKeys.verify, {
      key: match[1],
    });
    if (!record) return json({ error: "Invalid or revoked key" }, 401);
    // internal mutation — fire-and-forget-ish
    await ctx.runMutation(component.agentKeys.touch, { id: record._id });
    return {
      agentId: `${AGENT_USER_PREFIX}${record.name || record._id}`,
      keyId: record._id,
    };
  }

  const preflight = httpActionGeneric(async () => json({}, 204));

  const queue = httpActionGeneric(async (ctx, req) => {
    const auth = await verify(ctx, req);
    if (auth instanceof Response) return auth;

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "implement";
    const limit = Math.max(
      1,
      Math.min(50, Number(url.searchParams.get("limit") ?? "10")),
    );

    const state: ItemState =
      mode === "triage" ? "submitted" : "requested";
    if (mode !== "triage" && mode !== "implement") {
      return json({ error: `Unknown mode: ${mode}` }, 400);
    }
    const result = await ctx.runQuery(component.items.listByState, {
      state,
      limit,
    });
    // listByState returns { page, nextCursor }; agents want a flat array.
    const items = result?.page ?? [];
    return json({ mode, items });
  });

  const triage = httpActionGeneric(async (ctx, req) => {
    const auth = await verify(ctx, req);
    if (auth instanceof Response) return auth;

    const body = (await req.json().catch(() => null)) as any;
    if (!body?.itemId || !body?.decision) {
      return json({ error: "itemId and decision required" }, 400);
    }
    const state: ItemState =
      body.decision === "approve" ? "requested" : "rejected";

    await ctx.runMutation(component.items.transitionState, {
      itemId: body.itemId,
      state,
    });
    if (body.reason) {
      await ctx.runMutation(component.devLogs.post, {
        itemId: body.itemId,
        authorId: auth.agentId,
        message: `[${body.decision}] ${body.reason}`,
      });
    }
    return json({ ok: true, newState: state });
  });

  const claim = httpActionGeneric(async (ctx, req) => {
    const auth = await verify(ctx, req);
    if (auth instanceof Response) return auth;

    const body = (await req.json().catch(() => null)) as any;
    if (!body?.itemId) return json({ error: "itemId required" }, 400);

    await ctx.runMutation(component.items.transitionState, {
      itemId: body.itemId,
      state: "inProgress",
    });
    await ctx.runMutation(component.devLogs.post, {
      itemId: body.itemId,
      authorId: auth.agentId,
      message: `🤖 Agent ${auth.agentId} claimed this item.`,
    });
    return json({ ok: true });
  });

  const log = httpActionGeneric(async (ctx, req) => {
    const auth = await verify(ctx, req);
    if (auth instanceof Response) return auth;

    const body = (await req.json().catch(() => null)) as any;
    if (!body?.itemId || !body?.message) {
      return json({ error: "itemId and message required" }, 400);
    }
    await ctx.runMutation(component.devLogs.post, {
      itemId: body.itemId,
      authorId: auth.agentId,
      message: body.message,
    });
    return json({ ok: true });
  });

  const complete = httpActionGeneric(async (ctx, req) => {
    const auth = await verify(ctx, req);
    if (auth instanceof Response) return auth;

    const body = (await req.json().catch(() => null)) as any;
    if (!body?.itemId) return json({ error: "itemId required" }, 400);

    await ctx.runMutation(component.items.transitionState, {
      itemId: body.itemId,
      state: "completed",
    });
    const parts = [`🚢 Shipped by ${auth.agentId}.`];
    if (body.prUrl) parts.push(`PR: ${body.prUrl}`);
    if (body.commit) parts.push(`Commit: ${body.commit}`);
    if (body.summary) parts.push(body.summary);
    await ctx.runMutation(component.devLogs.post, {
      itemId: body.itemId,
      authorId: auth.agentId,
      message: parts.join("\n"),
    });
    return json({ ok: true });
  });

  const routes: Array<[string, "GET" | "POST", any]> = [
    ["/queue", "GET", queue],
    ["/triage", "POST", triage],
    ["/claim", "POST", claim],
    ["/log", "POST", log],
    ["/complete", "POST", complete],
  ];
  for (const [path, method, handler] of routes) {
    http.route({ path: `${prefix}${path}`, method, handler });
    http.route({
      path: `${prefix}${path}`,
      method: "OPTIONS",
      handler: preflight,
    });
  }
}
