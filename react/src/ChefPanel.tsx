/**
 * ChefPanel — the floating "build-mode" bubble for AI-agent-scaffolded apps.
 *
 * Three tabs:
 *   - Building: the agent's todo checklist + recent progress feed
 *   - Asking:   refinement questions the agent posted, with an inline answer box
 *   - Request:  a feature-request form + the in-flight/recent request list
 *
 * Host-agnostic, same contract as the other widgets in this package: the
 * host passes its own generated-API references via the `api` prop, so the
 * host keeps control of auth and function naming. The host's wrapper
 * module typically looks like `convex/wow.ts` (see the @convex-dev/feedback
 * README — "Build-mode UI").
 *
 * Wiring expectation — the host exposes these public functions (names are
 * up to the host; pass whatever refs you like):
 *
 *   listOpenRefinements(): { _id, text, answer?, state: "open"|"answered"|"skipped" }[]
 *   answerRefinement({ id, answer })
 *   skipRefinement({ id })
 *   listPublicItems(): { _id, title, description?, state, voteCount }[]
 *   submitRequest({ title, description })
 *   upvoteRequest({ id })
 *   listProgress(): { _id, message, kind: "step"|"shipped"|"note" }[]
 *   listTodos(): { _id, text, order, status: "pending"|"active"|"done" }[]
 */
import * as React from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";

// localStorage key for the panel's collapsed/expanded toggle. SSR-safe and
// swallows storage errors (Safari private mode, quota, disabled storage)
// so a broken storage layer never crashes the widget.
const COLLAPSED_STORAGE_KEY = "convex-feedback:chef-panel:collapsed";

function readCollapsedFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsedToStorage(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore — quota / disabled / private mode
  }
}

type AnyQuery<Args extends Record<string, any>, Returns = any> =
  FunctionReference<"query", "public", Args, Returns>;
type AnyMutation<Args extends Record<string, any>, Returns = any> =
  FunctionReference<"mutation", "public", Args, Returns>;

export type ChefRefinement = {
  _id: string;
  text: string;
  answer?: string;
  state: "open" | "answered" | "skipped";
};
export type ChefRequest = {
  _id: string;
  title: string;
  description?: string;
  state: string;
  voteCount: number;
};
export type ChefTodo = {
  _id: string;
  text: string;
  order: number;
  status: "pending" | "active" | "done";
};
export type ChefProgress = {
  _id: string;
  message: string;
  kind: "step" | "shipped" | "note";
};

export type ChefPanelApi = {
  listOpenRefinements: AnyQuery<{ limit?: number }, ChefRefinement[]>;
  answerRefinement: AnyMutation<{ id: string; answer: string }>;
  skipRefinement: AnyMutation<{ id: string }>;
  listPublicItems: AnyQuery<{ limit?: number }, ChefRequest[]>;
  submitRequest: AnyMutation<{ title: string; description: string }>;
  upvoteRequest: AnyMutation<{ id: string }>;
  listProgress: AnyQuery<Record<string, never>, ChefProgress[]>;
  listTodos: AnyQuery<Record<string, never>, ChefTodo[]>;
};

export function ChefPanel({ api }: { api: ChefPanelApi }) {
  const openQs = useQuery(api.listOpenRefinements, { limit: 10 });
  const answer = useMutation(api.answerRefinement);
  const skip = useMutation(api.skipRefinement);
  const requests = useQuery(api.listPublicItems, { limit: 10 });
  const submit = useMutation(api.submitRequest);
  const upvote = useMutation(api.upvoteRequest);
  const progress = useQuery(api.listProgress, {});
  const todos = useQuery(api.listTodos, {});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reqText, setReqText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Persist the collapsed state across reloads — without this the panel
  // springs back open on every navigation, which is noisy in build mode
  // where the user typically wants it tucked away.
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsedFromStorage);
  useEffect(() => {
    writeCollapsedToStorage(collapsed);
  }, [collapsed]);

  const openQuestions = (openQs ?? []).filter((q) => q.state === "open");
  const openCount = openQuestions.length;
  const todoUndone = (todos ?? []).filter((t) => t.status !== "done").length;
  const todosCount = (todos ?? []).length;

  const defaultTab: "asking" | "request" | "building" =
    openCount > 0 ? "asking" : "request";
  const [tab, setTab] = useState<"asking" | "request" | "building">(defaultTab);

  useEffect(() => {
    if (openCount > 0 && tab !== "asking") setTab("asking");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCount]);

  const headerLabel =
    openCount > 0
      ? "Chef is asking (" + openCount + ")"
      : "You're building with Chef by Convex";

  async function onSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = reqText.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const nl = trimmed.indexOf("\n");
      const title = nl >= 0 ? trimmed.slice(0, nl).trim() : trimmed;
      const description = nl >= 0 ? trimmed.slice(nl + 1).trim() : "";
      await submit({ title, description });
      setReqText("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        width: 400,
        maxWidth: "calc(100vw - 48px)",
        maxHeight: "min(640px, calc(100vh - 48px))",
        background: "white",
        borderRadius: 16,
        boxShadow: "0 20px 50px rgba(0,0,0,0.18), 0 6px 12px rgba(0,0,0,0.08)",
        border: "1px solid #f3f4f6",
        zIndex: 100,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: "inherit",
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          background: "linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)",
          border: 0,
          borderBottom: collapsed ? "none" : "1px solid #fed7aa",
          cursor: "pointer",
          textAlign: "left",
          width: "100%",
        }}
        aria-expanded={!collapsed}
      >
        <img
          src="https://chef.convex.dev/chef.svg"
          alt=""
          width={36}
          height={21}
          style={{ flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: "#9a3412",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {headerLabel}
          </div>
          <div style={{ fontSize: 12, color: "#c2410c" }}>
            Ask, answer, or request a feature.
          </div>
        </div>
        <div
          style={{
            fontSize: 18,
            color: "#9a3412",
            transform: collapsed ? "rotate(180deg)" : "none",
            transition: "transform 120ms ease",
          }}
          aria-hidden="true"
        >
          ▾
        </div>
      </button>

      {!collapsed && (
        <>
          <div
            role="tablist"
            style={{
              display: "flex",
              gap: 0,
              borderBottom: "1px solid #fed7aa",
              background: "#fffbf5",
            }}
          >
            <TabButton
              active={tab === "building"}
              onClick={() => setTab("building")}
              label="Building"
              badge={
                todosCount > 0
                  ? `${todosCount - todoUndone}/${todosCount}`
                  : null
              }
              badgeKind="neutral"
            />
            <TabButton
              active={tab === "asking"}
              onClick={() => setTab("asking")}
              label="Asking"
              badge={openCount > 0 ? String(openCount) : null}
              badgeKind="attention"
            />
            <TabButton
              active={tab === "request"}
              onClick={() => setTab("request")}
              label="Request"
              badge={null}
              badgeKind="neutral"
            />
          </div>

          <div
            style={{
              overflowY: "auto",
              padding: 14,
              background: "#fffbf5",
              flex: 1,
            }}
          >
            {tab === "building" && (
              <BuildingTab todos={todos} progress={progress} />
            )}
            {tab === "asking" && (
              <AskingTab
                items={openQs ?? []}
                drafts={drafts}
                setDrafts={setDrafts}
                onAnswer={answer}
                onSkip={skip}
                onSwitchToRequest={() => setTab("request")}
              />
            )}
            {tab === "request" && (
              <RequestTab
                reqText={reqText}
                setReqText={setReqText}
                submitting={submitting}
                onSubmit={onSubmitRequest}
                requests={requests ?? []}
                upvote={upvote}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
  badgeKind,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge: string | null;
  badgeKind: "neutral" | "attention";
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 12px",
        background: active ? "white" : "transparent",
        color: active ? "#9a3412" : "#a16207",
        border: 0,
        borderBottom: active ? "2px solid #ea580c" : "2px solid transparent",
        marginBottom: -1,
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label}
      {badge !== null && (
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 20,
            height: 18,
            padding: "0 6px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            color: badgeKind === "attention" ? "white" : "#9a3412",
            background: badgeKind === "attention" ? "#ea580c" : "#fde68a",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function BuildingTab({
  todos,
  progress,
}: {
  todos: ChefTodo[] | undefined;
  progress: ChefProgress[] | undefined;
}) {
  const hasTodos = todos && todos.length > 0;
  const hasProgress = progress && progress.length > 0;

  if (!hasTodos && !hasProgress) {
    return (
      <p style={{ fontSize: 13, color: "#9a3412", margin: 0 }}>
        Chef hasn't started yet. Once they're working, you'll see a checklist
        here.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {hasTodos && (
        <section style={{ display: "grid", gap: 6 }}>
          <SectionLabel>Plan</SectionLabel>
          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: 5,
            }}
          >
            {todos!.map((t) => {
              const dot =
                t.status === "done"
                  ? {
                      glyph: "✓",
                      color: "#15803d",
                      bg: "#dcfce7",
                      pulse: false,
                    }
                  : t.status === "active"
                    ? {
                        glyph: "●",
                        color: "#ea580c",
                        bg: "#fff7ed",
                        pulse: true,
                      }
                    : {
                        glyph: "○",
                        color: "#9ca3af",
                        bg: "#f3f4f6",
                        pulse: false,
                      };
              return (
                <li
                  key={t._id}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    fontSize: 13,
                    color: t.status === "done" ? "#6b7280" : "#1f2937",
                    textDecoration:
                      t.status === "done" ? "line-through" : "none",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: dot.color,
                      background: dot.bg,
                      marginTop: 1,
                      animation: dot.pulse
                        ? "chef-pulse 1.4s ease-in-out infinite"
                        : "none",
                    }}
                  >
                    {dot.glyph}
                  </span>
                  <span style={{ flex: 1, lineHeight: 1.4 }}>{t.text}</span>
                </li>
              );
            })}
          </ol>
          <style>{`@keyframes chef-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.55; transform: scale(1.15); } }`}</style>
        </section>
      )}

      {hasProgress && (
        <section style={{ display: "grid", gap: 6 }}>
          <SectionLabel>Recent</SectionLabel>
          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: 4,
            }}
          >
            {progress!.map((p, i) => {
              const dot =
                p.kind === "shipped"
                  ? { glyph: "✓", color: "#15803d", bg: "#dcfce7" }
                  : p.kind === "note"
                    ? { glyph: "·", color: "#6b7280", bg: "#f3f4f6" }
                    : { glyph: "●", color: "#ea580c", bg: "#fff7ed" };
              return (
                <li
                  key={p._id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    opacity: i === 0 ? 1 : 0.65,
                    fontSize: 12,
                    color: "#374151",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      width: 16,
                      height: 16,
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: dot.color,
                      background: dot.bg,
                      marginTop: 2,
                    }}
                  >
                    {dot.glyph}
                  </span>
                  <span style={{ flex: 1, lineHeight: 1.4 }}>{p.message}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function AskingTab({
  items,
  drafts,
  setDrafts,
  onAnswer,
  onSkip,
  onSwitchToRequest,
}: {
  items: ChefRefinement[];
  drafts: Record<string, string>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onAnswer: (args: { id: string; answer: string }) => Promise<unknown>;
  onSkip: (args: { id: string }) => Promise<unknown>;
  onSwitchToRequest: () => void;
}) {
  const open = items.filter((q) => q.state === "open");
  const recentlyAnswered = items.filter((q) => q.state === "answered");

  if (open.length === 0 && recentlyAnswered.length === 0) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <p style={{ fontSize: 13, color: "#9a3412", margin: 0 }}>
          Chef has no questions right now. As they build, they may stop and
          ask — you'll see them here when they do.
        </p>
        <button
          type="button"
          onClick={onSwitchToRequest}
          style={{
            padding: "8px 12px",
            background: "white",
            color: "#9a3412",
            border: "1px solid #fed7aa",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            alignSelf: "start",
          }}
        >
          → Request a feature instead
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {open[0] && (
        <QuestionCard
          q={open[0]}
          draft={drafts[open[0]._id] ?? ""}
          onChange={(v) => setDrafts((d) => ({ ...d, [open[0]._id]: v }))}
          onAnswer={async () => {
            const t = (drafts[open[0]._id] ?? "").trim();
            if (!t) return;
            await onAnswer({ id: open[0]._id, answer: t });
            setDrafts((d) => {
              const next = { ...d };
              delete next[open[0]._id];
              return next;
            });
          }}
          onSkip={() => onSkip({ id: open[0]._id })}
        />
      )}

      {open.length > 1 && (
        <section style={{ display: "grid", gap: 4 }}>
          <SectionLabel>Up next ({open.length - 1})</SectionLabel>
          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: 4,
            }}
          >
            {open.slice(1).map((q) => (
              <li
                key={q._id}
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  lineHeight: 1.4,
                  paddingLeft: 12,
                  borderLeft: "2px solid #fed7aa",
                }}
              >
                {q.text}
              </li>
            ))}
          </ol>
        </section>
      )}

      {recentlyAnswered.length > 0 && (
        <section style={{ display: "grid", gap: 6 }}>
          <SectionLabel>Answered</SectionLabel>
          {recentlyAnswered.map((q) => (
            <div
              key={q._id}
              style={{
                padding: 10,
                borderRadius: 10,
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                fontSize: 13,
                color: "#1f2937",
              }}
            >
              <div style={{ color: "#374151", marginBottom: 4 }}>{q.text}</div>
              <div
                style={{
                  fontSize: 12,
                  color: "#15803d",
                  display: "flex",
                  gap: 6,
                  alignItems: "flex-start",
                }}
              >
                <span aria-hidden="true">✓</span>
                <span>{q.answer ? `You: ${q.answer}` : "You answered"}</span>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function QuestionCard({
  q,
  draft,
  onChange,
  onAnswer,
  onSkip,
}: {
  q: ChefRefinement;
  draft: string;
  onChange: (v: string) => void;
  onAnswer: () => Promise<void>;
  onSkip: () => Promise<unknown>;
}) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: "white",
        border: "1px solid #fed7aa",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: "#1f2937",
          lineHeight: 1.45,
          whiteSpace: "pre-wrap",
        }}
      >
        {q.text}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onAnswer();
        }}
        style={{ display: "grid", gap: 8 }}
      >
        <textarea
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your answer…"
          rows={3}
          style={{
            fontSize: 14,
            padding: 8,
            borderRadius: 8,
            border: "1px solid #fed7aa",
            outline: "none",
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="submit"
            disabled={!draft.trim()}
            style={{
              flex: 1,
              padding: "8px 12px",
              background: draft.trim() ? "#ea580c" : "#fed7aa",
              color: "white",
              border: 0,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: draft.trim() ? "pointer" : "not-allowed",
            }}
          >
            Send to Chef
          </button>
          <button
            type="button"
            onClick={onSkip}
            style={{
              padding: "8px 12px",
              background: "white",
              color: "#9a3412",
              border: "1px solid #fed7aa",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Skip
          </button>
        </div>
      </form>
    </div>
  );
}

function RequestTab({
  reqText,
  setReqText,
  submitting,
  onSubmit,
  requests,
  upvote,
}: {
  reqText: string;
  setReqText: (v: string) => void;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  requests: ChefRequest[];
  upvote: (args: { id: string }) => Promise<unknown>;
}) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={{ display: "grid", gap: 6 }}>
        <SectionLabel>What should Chef build next?</SectionLabel>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 8 }}>
          <textarea
            value={reqText}
            onChange={(e) => setReqText(e.target.value)}
            placeholder="e.g., add dark mode toggle"
            rows={3}
            style={{
              fontSize: 14,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #fed7aa",
              outline: "none",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          <button
            type="submit"
            disabled={submitting || !reqText.trim()}
            style={{
              padding: "8px 12px",
              background: submitting || !reqText.trim() ? "#fed7aa" : "#ea580c",
              color: "white",
              border: 0,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor:
                submitting || !reqText.trim() ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Sending…" : "Send to Chef"}
          </button>
        </form>
      </section>

      {requests.length > 0 && (
        <section style={{ display: "grid", gap: 6 }}>
          <SectionLabel>In flight &amp; recent</SectionLabel>
          <div style={{ display: "grid", gap: 6 }}>
            {requests.map((r) => {
              const stateColor =
                r.state === "completed"
                  ? "#15803d"
                  : r.state === "inProgress"
                    ? "#ea580c"
                    : r.state === "rejected"
                      ? "#9ca3af"
                      : "#6b7280";
              const stateLabel =
                r.state === "inProgress"
                  ? "Building…"
                  : r.state === "completed"
                    ? "Shipped"
                    : r.state === "rejected"
                      ? "Skipped"
                      : "Queued";
              return (
                <div
                  key={r._id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #f3f4f6",
                    background: "white",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => upvote({ id: r._id })}
                    style={{
                      minWidth: 36,
                      padding: "4px 6px",
                      border: "1px solid #fed7aa",
                      borderRadius: 6,
                      background: "#fff7ed",
                      fontWeight: 700,
                      fontSize: 12,
                      color: "#9a3412",
                      cursor: "pointer",
                    }}
                    title="Up-rank"
                  >
                    ▲ {r.voteCount}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "#1f2937",
                      }}
                    >
                      {r.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: stateColor,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                      }}
                    >
                      {stateLabel}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        color: "#9a3412",
      }}
    >
      {children}
    </div>
  );
}
