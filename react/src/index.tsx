/**
 * Prebuilt React widgets for the @convex-dev/feedback feature-request component.
 *
 * These widgets are deliberately host-agnostic: the host passes in its own
 * generated-API references, so the host keeps control of auth and function
 * naming. Widgets never call ctx.auth themselves — that's done server-side
 * in the host's mutation wrappers.
 *
 * All widgets accept:
 *   - `api` — a bag of the host's query/mutation references
 *   - `onSelectItem?(itemId)` — optional navigation callback
 *   - (for admin actions) `viewerIsAdmin?: boolean` — host decides
 */
import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";

// The build-mode floating panel (todos / refinement questions / requests).
// Lives in its own file because it's a different shape from the
// feature-request widgets — it talks to the wow-shell wrapper functions.
export { ChefPanel } from "./ChefPanel.js";
export type {
  ChefPanelApi,
  ChefRefinement,
  ChefRequest,
  ChefTodo,
  ChefProgress,
} from "./ChefPanel.js";

type AnyQuery<Args extends Record<string, any>, Returns = any> =
  FunctionReference<"query", "public", Args, Returns>;
type AnyMutation<Args extends Record<string, any>, Returns = any> =
  FunctionReference<"mutation", "public", Args, Returns>;

export type ItemState =
  | "submitted"
  | "requested"
  | "planned"
  | "inProgress"
  | "rejected"
  | "completed";

// ============================================================
// stylesheet — injected once on first render
// ============================================================

const STYLE_ID = "convex-ship-react-styles";
const CSS = `
.ship-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; color: #1a1a1a; }
.ship-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.ship-title { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
.ship-sub { opacity: 0.65; font-size: 14px; margin: 6px 0 0; }

.ship-tabs { display: flex; gap: 6px; margin: 20px 0 16px; flex-wrap: wrap; }
.ship-tab {
  padding: 7px 14px; background: white; color: #444;
  border: 1px solid #e3e3e3; border-radius: 999px;
  cursor: pointer; font-size: 13px; font-weight: 500;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.ship-tab:hover { border-color: #bbb; color: #111; }
.ship-tab-active {
  background: #111; color: white; border-color: #111;
  font-weight: 600;
}
.ship-tab-active:hover { background: #111; color: white; border-color: #111; }

.ship-list { display: grid; gap: 10px; }
.ship-row {
  display: flex; gap: 14px; align-items: center;
  padding: 14px 16px;
  background: white;
  border: 1px solid #eaeaea;
  border-radius: 10px;
  cursor: pointer;
  width: 100%;
  text-align: left;
  font-family: inherit;
  transition: border-color 140ms ease, transform 140ms ease, box-shadow 140ms ease;
}
.ship-row:hover {
  border-color: #d0d7e2;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.04);
}
.ship-row-title { font-weight: 600; font-size: 15px; line-height: 1.35; color: #111; }
.ship-row-meta { font-size: 12px; color: #666; margin-top: 3px; display: flex; align-items: center; gap: 8px; }

.ship-vote-pill {
  display: inline-flex; flex-direction: column; align-items: center;
  justify-content: center;
  min-width: 54px; padding: 6px 10px;
  background: linear-gradient(180deg, #f7f9fc 0%, #eef2f7 100%);
  border: 1px solid #e1e6ee;
  border-radius: 10px;
  font-weight: 700;
}
.ship-vote-pill-num { font-size: 16px; color: #111; line-height: 1; }
.ship-vote-pill-label { font-size: 10px; color: #888; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }

.ship-badge {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600; letter-spacing: 0.3px; text-transform: uppercase;
}
.ship-badge-submitted   { background: #fff6e0; color: #8a6400; }
.ship-badge-requested   { background: #e6efff; color: #1849a9; }
.ship-badge-planned     { background: #efeaff; color: #5a32b3; }
.ship-badge-inProgress  { background: #e8f7ee; color: #186a3b; }
.ship-badge-completed   { background: #dff5ea; color: #0a6b3a; }
.ship-badge-rejected    { background: #fde7e7; color: #9b1c1c; }

.ship-btn-primary {
  padding: 8px 14px; background: #111; color: white;
  border: 1px solid #111; border-radius: 8px;
  cursor: pointer; font-weight: 600; font-size: 14px;
  transition: background 120ms ease, transform 80ms ease;
}
.ship-btn-primary:hover { background: #333; }
.ship-btn-primary:active { transform: translateY(1px); }
.ship-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.ship-btn-secondary {
  padding: 7px 12px; background: white; color: #333;
  border: 1px solid #d0d0d0; border-radius: 8px;
  cursor: pointer; font-size: 13px; font-weight: 500;
  transition: border-color 120ms ease, background 120ms ease;
}
.ship-btn-secondary:hover { border-color: #888; background: #fafafa; }

.ship-input {
  padding: 10px 12px; border: 1px solid #dcdcdc; border-radius: 8px;
  font-size: 14px; font-family: inherit; background: white;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.ship-input:focus { outline: none; border-color: #8aa7d8; box-shadow: 0 0 0 3px rgba(138,167,216,0.2); }

.ship-empty {
  padding: 32px; text-align: center; color: #888;
  background: #fafafa; border: 1px dashed #e0e0e0; border-radius: 10px;
}

.ship-vote-box {
  display: flex; gap: 14px; align-items: center;
  margin-top: 24px; padding: 14px 16px;
  background: linear-gradient(180deg, #fafbfc 0%, #f2f4f7 100%);
  border: 1px solid #e6e8ec;
  border-radius: 10px;
}

.ship-section-title {
  font-size: 13px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.6px; color: #666; margin: 28px 0 10px;
}

.ship-devlog-list { display: grid; gap: 10px; }
.ship-devlog {
  position: relative;
  padding: 12px 14px 12px 18px;
  background: white;
  border: 1px solid #e6eef9;
  border-left: 3px solid #4a90e2;
  border-radius: 8px;
}
.ship-devlog-time { font-size: 11px; color: #888; margin-bottom: 4px; }

.ship-modal-backdrop {
  position: fixed; inset: 0; background: rgba(10,15,25,0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000; animation: ship-fadein 120ms ease;
}
.ship-modal-sheet {
  background: white; color: #111; border-radius: 14px; padding: 22px;
  width: min(560px, 94vw); max-height: 88vh; overflow: auto;
  box-shadow: 0 24px 70px rgba(0,0,0,0.28);
  animation: ship-popin 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes ship-fadein { from { opacity: 0; } to { opacity: 1; } }
@keyframes ship-popin { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }

.ship-admin-row {
  display: flex; gap: 10px; align-items: center;
  padding: 12px 14px;
  background: white;
  border: 1px solid #eaeaea;
  border-radius: 10px;
}
`;

function useInjectedStyles() {
  React.useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

function StateBadge({ state }: { state: ItemState }) {
  return (
    <span className={`ship-badge ship-badge-${state}`}>
      {state === "inProgress" ? "in progress" : state}
    </span>
  );
}

function VotePill({ amount }: { amount: number }) {
  return (
    <div className="ship-vote-pill" aria-label={`${amount} votes`}>
      <div className="ship-vote-pill-num">▲ {amount}</div>
      <div className="ship-vote-pill-label">votes</div>
    </div>
  );
}

// ============================================================
// <FeatureRequestButton /> — single button + modal
// ============================================================

export type FeatureRequestApi = {
  submit: AnyMutation<{ title: string; description: string }>;
  listPublic: AnyQuery<{ state?: ItemState }>;
  upvote: AnyMutation<{ itemId: string }>;
};

export type FeatureRequestButtonProps = {
  api: FeatureRequestApi;
  label?: string;
  className?: string;
};

export function FeatureRequestButton({
  api,
  label = "Request a feature",
  className,
}: FeatureRequestButtonProps) {
  useInjectedStyles();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "ship-btn-primary"}
      >
        {label}
      </button>
      {open ? (
        <FeatureRequestModal api={api} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function FeatureRequestModal({
  api,
  onClose,
}: {
  api: FeatureRequestApi;
  onClose: () => void;
}) {
  const submit = useMutation(api.submit);
  const upvote = useMutation(api.upvote);
  const list = useQuery(api.listPublic, {});
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await submit({ title, description });
      setTitle("");
      setDescription("");
    } finally {
      setSubmitting(false);
    }
  }

  const items: any[] = (list as any)?.page ?? [];

  return (
    <div className="ship-modal-backdrop ship-root" onClick={onClose}>
      <div className="ship-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ship-head">
          <h2 className="ship-title">Feature requests</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 26,
              cursor: "pointer",
              lineHeight: 1,
              color: "#888",
              padding: 0,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form
          onSubmit={onSubmit}
          style={{ display: "grid", gap: 8, marginTop: 16 }}
        >
          <input
            className="ship-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title"
          />
          <textarea
            className="ship-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details (optional)"
            rows={3}
          />
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="ship-btn-primary"
          >
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </form>
        <div style={{ marginTop: 20 }}>
          {list === undefined ? (
            <div style={{ opacity: 0.6 }}>Loading…</div>
          ) : items.length === 0 ? (
            <div className="ship-empty">No requests yet — be the first!</div>
          ) : (
            <div className="ship-list">
              {items.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  className="ship-row"
                  onClick={() => upvote({ itemId: item._id })}
                  title="Upvote"
                >
                  <VotePill amount={item.stats?.totalAmount ?? 0} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ship-row-title">{item.title}</div>
                    <div className="ship-row-meta">
                      <StateBadge state={item.state} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// <FeatureRequestList /> — full list with state tabs
// ============================================================

const PUBLIC_STATES: { state: ItemState; label: string }[] = [
  { state: "requested", label: "Requested" },
  { state: "planned", label: "Planned" },
  { state: "inProgress", label: "In progress" },
  { state: "completed", label: "Shipped" },
];

export type FeatureRequestListProps = {
  api: {
    listPublic: AnyQuery<{
      state?: ItemState;
      limit?: number;
      cursor?: string | null;
    }>;
  };
  onSelectItem?: (itemId: string) => void;
  onNewRequest?: () => void;
};

export function FeatureRequestList({
  api,
  onSelectItem,
  onNewRequest,
}: FeatureRequestListProps) {
  useInjectedStyles();
  const [tab, setTab] = React.useState<ItemState>("requested");
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [accumulated, setAccumulated] = React.useState<any[]>([]);
  // Reset when tab changes
  React.useEffect(() => {
    setCursor(null);
    setAccumulated([]);
  }, [tab]);
  const data = useQuery(api.listPublic, { state: tab, cursor });
  React.useEffect(() => {
    if (!data) return;
    setAccumulated((prev) => {
      // On first page (cursor null) we replace; subsequent pages append,
      // deduping by _id in case of realtime overlap.
      const base = cursor === null ? [] : prev;
      const seen = new Set(base.map((i) => i._id));
      const next = [...base];
      for (const item of (data as any).page) {
        if (!seen.has(item._id)) {
          next.push(item);
          seen.add(item._id);
        }
      }
      return next;
    });
  }, [data, cursor]);

  const items = accumulated;
  const nextCursor: string | null = (data as any)?.nextCursor ?? null;

  return (
    <div className="ship-root">
      <div className="ship-head">
        <div>
          <h2 className="ship-title">Feature requests</h2>
          <p className="ship-sub">
            See what people are asking for and vote on what matters most.
          </p>
        </div>
        {onNewRequest ? (
          <button
            type="button"
            onClick={onNewRequest}
            className="ship-btn-primary"
          >
            + New request
          </button>
        ) : null}
      </div>
      <div className="ship-tabs">
        {PUBLIC_STATES.map((t) => (
          <button
            key={t.state}
            type="button"
            onClick={() => setTab(t.state)}
            className={
              tab === t.state ? "ship-tab ship-tab-active" : "ship-tab"
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      {data === undefined && items.length === 0 ? (
        <div style={{ opacity: 0.6 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div className="ship-empty">
          Nothing here yet.
          {onNewRequest ? " Be the first to request something!" : ""}
        </div>
      ) : (
        <div className="ship-list">
          {items.map((item) => (
            <button
              key={item._id}
              type="button"
              className="ship-row"
              onClick={() => onSelectItem?.(item._id)}
            >
              <VotePill amount={item.stats?.totalAmount ?? 0} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ship-row-title">
                  <span style={{ color: "#999", fontWeight: 500 }}>
                    #{item.number}
                  </span>{" "}
                  {item.title}
                </div>
                <div className="ship-row-meta">
                  <StateBadge state={item.state} />
                  <span>·</span>
                  <span>
                    {item.stats?.supporterCount ?? 0} supporter
                    {item.stats?.supporterCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {nextCursor ? (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button
            type="button"
            className="ship-btn-secondary"
            onClick={() => setCursor(nextCursor)}
          >
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// <FeatureRequestDetail /> — detail view with upvote + dev log
// ============================================================

export type FeatureRequestDetailApi = {
  get: AnyQuery<{ itemId: string }>;
  upvote: AnyMutation<{ itemId: string }>;
  removeVote: AnyMutation<{ itemId: string }>;
  transition?: AnyMutation<{ itemId: string; state: ItemState }>;
  postDevLog?: AnyMutation<{ itemId: string; message: string }>;
  merge?: AnyMutation<{ sourceId: string; targetId: string }>;
  grantChips?: AnyMutation<{
    itemId: string;
    amount: number;
    reason?: string;
  }>;
};

export type FeatureRequestDetailProps = {
  api: FeatureRequestDetailApi;
  itemId: string;
  viewerIsAdmin?: boolean;
  onBack?: () => void;
};

export function FeatureRequestDetail({
  api,
  itemId,
  viewerIsAdmin = false,
  onBack,
}: FeatureRequestDetailProps) {
  useInjectedStyles();
  const data = useQuery(api.get, { itemId }) as any;
  const upvote = useMutation(api.upvote);
  const removeVote = useMutation(api.removeVote);
  const transition = api.transition ? useMutation(api.transition) : null;
  const postDevLog = api.postDevLog ? useMutation(api.postDevLog) : null;
  const merge = api.merge ? useMutation(api.merge) : null;
  const grantChips = api.grantChips ? useMutation(api.grantChips) : null;
  const [logMsg, setLogMsg] = React.useState("");
  const [mergeTarget, setMergeTarget] = React.useState("");
  const [grantAmount, setGrantAmount] = React.useState("");
  const [grantReason, setGrantReason] = React.useState("");

  if (data === undefined)
    return <div style={{ opacity: 0.6 }}>Loading…</div>;
  if (data === null) return <div>Not found.</div>;

  const { item, stats, userBid, devLogs, mergedInto } = data;

  return (
    <div className="ship-root">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontSize: 13,
            color: "#666",
            marginBottom: 8,
          }}
        >
          ← All requests
        </button>
      ) : null}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.015em",
          }}
        >
          <span style={{ color: "#bbb", fontWeight: 500 }}>
            #{item.number}
          </span>{" "}
          {item.title}
        </h1>
      </div>
      <div style={{ marginTop: 8 }}>
        <StateBadge state={item.state} />
      </div>
      {mergedInto ? (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            background: "#fff8e1",
            border: "1px solid #f5d76e",
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          This item was merged into{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onBack?.();
            }}
            style={{ fontWeight: 600, color: "#8a6400" }}
          >
            #{mergedInto.number} {mergedInto.title}
          </a>
          . Votes were transferred.
        </div>
      ) : null}
      <div
        style={{
          marginTop: 16,
          fontSize: 15,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          color: "#222",
        }}
      >
        {item.description || (
          <em style={{ opacity: 0.6 }}>No description provided.</em>
        )}
      </div>

      <div className="ship-vote-box">
        <VotePill amount={stats.totalAmount} />
        <div style={{ flex: 1, fontSize: 13, color: "#555" }}>
          {stats.supporterCount} supporter
          {stats.supporterCount === 1 ? "" : "s"}
        </div>
        {userBid ? (
          <button
            type="button"
            onClick={() => void removeVote({ itemId })}
            className="ship-btn-secondary"
          >
            Remove vote
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void upvote({ itemId })}
            className="ship-btn-primary"
          >
            ▲ Upvote
          </button>
        )}
      </div>

      <h3 className="ship-section-title">Dev log</h3>
      {!devLogs?.length ? (
        <div className="ship-empty" style={{ padding: 18, fontSize: 13 }}>
          No updates yet.
        </div>
      ) : (
        <div className="ship-devlog-list">
          {devLogs.map((log: any) => (
            <div key={log._id} className="ship-devlog">
              <div className="ship-devlog-time">
                {new Date(log.stamp).toLocaleString()}
              </div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>
                {log.message}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewerIsAdmin && transition ? (
        <>
          <h3 className="ship-section-title">Admin</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(
              [
                "requested",
                "planned",
                "inProgress",
                "completed",
                "rejected",
              ] as ItemState[]
            ).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void transition({ itemId, state: s })}
                disabled={s === item.state}
                className={
                  s === item.state
                    ? "ship-tab ship-tab-active"
                    : "ship-tab"
                }
              >
                {s === "inProgress" ? "in progress" : s}
              </button>
            ))}
          </div>
          {postDevLog ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!logMsg.trim()) return;
                void postDevLog({ itemId, message: logMsg }).then(() =>
                  setLogMsg(""),
                );
              }}
              style={{ display: "grid", gap: 8, marginTop: 12 }}
            >
              <textarea
                className="ship-input"
                value={logMsg}
                onChange={(e) => setLogMsg(e.target.value)}
                placeholder="Post a dev log update…"
                rows={3}
              />
              <button
                type="submit"
                className="ship-btn-primary"
                disabled={!logMsg.trim()}
              >
                Post update
              </button>
            </form>
          ) : null}
          {merge ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!mergeTarget.trim()) return;
                void merge({
                  sourceId: itemId,
                  targetId: mergeTarget.trim(),
                }).then(() => setMergeTarget(""));
              }}
              style={{
                display: "flex",
                gap: 8,
                marginTop: 12,
                alignItems: "center",
              }}
            >
              <input
                className="ship-input"
                value={mergeTarget}
                onChange={(e) => setMergeTarget(e.target.value)}
                placeholder="Merge into… (paste target item _id)"
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                className="ship-btn-secondary"
                disabled={!mergeTarget.trim()}
              >
                Merge
              </button>
            </form>
          ) : null}
          {grantChips ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amount = Number(grantAmount);
                if (!Number.isFinite(amount) || amount === 0) return;
                void grantChips({
                  itemId,
                  amount,
                  reason: grantReason.trim() || undefined,
                }).then(() => {
                  setGrantAmount("");
                  setGrantReason("");
                });
              }}
              style={{
                display: "flex",
                gap: 8,
                marginTop: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <input
                className="ship-input"
                type="number"
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                placeholder="+10"
                style={{ width: 90 }}
                title="Positive to boost, negative to subtract"
              />
              <input
                className="ship-input"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                placeholder="Reason (optional) — e.g. 'strategic priority'"
                style={{ flex: 1, minWidth: 180 }}
              />
              <button
                type="submit"
                className="ship-btn-secondary"
                disabled={!grantAmount.trim()}
                title="Add/remove chips directly; writes a dev-log audit entry"
              >
                Grant chips
              </button>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ============================================================
// <NotificationBell /> — unread count + dropdown
// ============================================================

export type NotificationApi = {
  list: AnyQuery<{ limit?: number; unreadOnly?: boolean }>;
  unreadCount: AnyQuery<Record<string, never>>;
  markRead: AnyMutation<{ id: string }>;
  markAllRead: AnyMutation<Record<string, never>>;
};

export type NotificationBellProps = {
  api: NotificationApi;
  onSelectItem?: (itemId: string) => void;
};

export function NotificationBell({
  api,
  onSelectItem,
}: NotificationBellProps) {
  useInjectedStyles();
  const [open, setOpen] = React.useState(false);
  const count = useQuery(api.unreadCount, {}) as number | undefined;
  const list = useQuery(api.list, open ? { limit: 20 } : "skip") as
    | any[]
    | undefined;
  const markRead = useMutation(api.markRead);
  const markAllRead = useMutation(api.markAllRead);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "relative",
          padding: "6px 10px",
          background: "white",
          border: "1px solid #ddd",
          borderRadius: 999,
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
        }}
        aria-label="Notifications"
      >
        🔔
        {count && count > 0 ? (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "#e63946",
              color: "white",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              padding: "1px 6px",
              minWidth: 18,
              textAlign: "center",
            }}
          >
            {count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 340,
            maxHeight: 420,
            overflow: "auto",
            background: "white",
            border: "1px solid #e5e5e5",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderBottom: "1px solid #eee",
            }}
          >
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            {(count ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead({})}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 12,
                  color: "#4a90e2",
                  cursor: "pointer",
                }}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {list === undefined ? (
            <div style={{ padding: 14, fontSize: 13, color: "#888" }}>
              Loading…
            </div>
          ) : list.length === 0 ? (
            <div style={{ padding: 14, fontSize: 13, color: "#888" }}>
              Nothing yet.
            </div>
          ) : (
            <div>
              {list.map((n: any) => (
                <button
                  key={n._id}
                  type="button"
                  onClick={() => {
                    if (!n.isRead) void markRead({ id: n._id });
                    onSelectItem?.(n.itemId);
                    setOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    background: n.isRead ? "white" : "#f4f8ff",
                    border: "none",
                    borderBottom: "1px solid #f0f0f0",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ fontSize: 13, color: "#222" }}>
                    {n.message}
                  </div>
                  <div
                    style={{ fontSize: 11, color: "#888", marginTop: 3 }}
                  >
                    {new Date(n.stamp).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// <AdminPanel /> — admin dashboard grouped by state
// ============================================================

export type AdminPanelApi = {
  listAllAdmin: AnyQuery<{ limit?: number; cursor?: string | null }>;
  transition: AnyMutation<{ itemId: string; state: ItemState }>;
  merge?: AnyMutation<{ sourceId: string; targetId: string }>;
};

export type AdminPanelProps = {
  api: AdminPanelApi;
  viewerIsAdmin: boolean;
  onSelectItem?: (itemId: string) => void;
};

const ADMIN_ORDER: ItemState[] = [
  "submitted",
  "requested",
  "planned",
  "inProgress",
  "completed",
  "rejected",
];

export function AdminPanel({
  api,
  viewerIsAdmin,
  onSelectItem,
}: AdminPanelProps) {
  useInjectedStyles();
  const items = useQuery(
    api.listAllAdmin,
    viewerIsAdmin ? {} : "skip",
  ) as { page: any[]; nextCursor: string | null } | undefined;
  const transition = useMutation(api.transition);

  if (!viewerIsAdmin) {
    return <div>You are not an admin.</div>;
  }
  if (items === undefined) return <div style={{ opacity: 0.6 }}>Loading…</div>;

  const grouped: Record<string, any[]> = {};
  items.page.forEach((i: any) => {
    (grouped[i.state] ??= []).push(i);
  });

  return (
    <div className="ship-root">
      <h2 className="ship-title">Admin</h2>
      <p className="ship-sub">
        Review submissions, move items through the pipeline, post updates.
      </p>
      {ADMIN_ORDER.map((state) => (
        <section key={state} style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StateBadge state={state} />
            <span style={{ fontSize: 13, color: "#888" }}>
              ({grouped[state]?.length ?? 0})
            </span>
          </div>
          {!grouped[state]?.length ? (
            <div
              style={{
                opacity: 0.5,
                fontSize: 13,
                marginTop: 8,
                paddingLeft: 2,
              }}
            >
              —
            </div>
          ) : (
            <div className="ship-list" style={{ marginTop: 10 }}>
              {grouped[state].map((item: any) => (
                <div key={item._id} className="ship-admin-row">
                  <VotePill amount={item.stats.totalAmount} />
                  <button
                    type="button"
                    onClick={() => onSelectItem?.(item._id)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: onSelectItem ? "pointer" : "default",
                      fontFamily: "inherit",
                      color: "inherit",
                    }}
                  >
                    <div className="ship-row-title">
                      <span style={{ color: "#999", fontWeight: 500 }}>
                        #{item.number}
                      </span>{" "}
                      {item.title}
                    </div>
                    <div className="ship-row-meta">
                      {item.stats.supporterCount} supporter
                      {item.stats.supporterCount === 1 ? "" : "s"}
                    </div>
                  </button>
                  {state === "submitted" ? (
                    <>
                      <button
                        type="button"
                        className="ship-btn-secondary"
                        onClick={() =>
                          void transition({
                            itemId: item._id,
                            state: "requested",
                          })
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="ship-btn-secondary"
                        onClick={() =>
                          void transition({
                            itemId: item._id,
                            state: "rejected",
                          })
                        }
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
