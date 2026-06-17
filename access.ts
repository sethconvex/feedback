import type { QueryCtx } from "./_generated/server";

// Role/identity resolution for the component's visibility rules. The host
// forwards a trusted `viewer` (the authenticated userId, or null/omitted for an
// anonymous browser visitor) and/or an `agentKey` (a CLI/agent credential from
// the agentKeys table). The component resolves the actor and enforces access —
// rather than leaving every gate to the host.

export type Actor = "admin" | "agent" | "member" | "anon";

export type ActorArgs = { viewer?: string | null; agentKey?: string };

export async function resolveActor(
  ctx: QueryCtx,
  args: ActorArgs,
): Promise<Actor> {
  // An agent presents a (non-revoked) agent key — full trust, like the build agent.
  if (args.agentKey) {
    const k = await ctx.db
      .query("agentKeys")
      .withIndex("by_key", (q) => q.eq("key", args.agentKey!))
      .unique();
    if (k && !k.revoked) return "agent";
  }
  if (!args.viewer) return "anon";
  const u = await ctx.db
    .query("users")
    .withIndex("by_userId", (q) => q.eq("userId", args.viewer!))
    .unique();
  if (!u) return "anon";
  return u.role === "admin" ? "admin" : "member";
}

export function isPrivileged(a: Actor): boolean {
  return a === "admin" || a === "agent";
}

// Gate for "list all active requests / refinements" surfaces. Only admins or
// agents may see the full queue; members and anonymous visitors are rejected.
export async function requirePrivileged(
  ctx: QueryCtx,
  args: ActorArgs,
): Promise<Actor> {
  const a = await resolveActor(ctx, args);
  if (!isPrivileged(a)) {
    throw new Error(
      "Unauthorized: only admins or agents can list all active requests and refinements.",
    );
  }
  return a;
}

// Gate for build status (todos + progress feed + open refinements). Visible to
// admins/agents always, and to everyone ONLY while there are no users yet (the
// early "watching the agent build" phase, before anyone has signed up). Once
// real users exist, ordinary visitors no longer see the build chrome.
export async function buildStatusVisible(
  ctx: QueryCtx,
  args: ActorArgs,
): Promise<boolean> {
  if (isPrivileged(await resolveActor(ctx, args))) return true;
  const anyUser = await ctx.db.query("users").take(1);
  return anyUser.length === 0;
}
