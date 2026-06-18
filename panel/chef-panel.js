// chef-panel.js — CANONICAL source of the floating "Chef" build panel.
// Owned by @convex-dev/feedback; hosts (e.g. the Convex quickstart anteater)
// vendor this file from node_modules and serve it at /chef-panel so display
// fixes ship by bumping the component, not by editing a copy.

import { ConvexClient } from "https://esm.sh/convex@1.17.4/browser";
import { makeFunctionReference } from "https://esm.sh/convex@1.17.4/server";

const ref = (name) => makeFunctionReference(name);

// Official Chef brand mark (toque + "Chef" wordmark) — this is the brand, use
// it everywhere the panel identifies itself.
const BRAND_SRC = "https://chef.convex.dev/chef.svg";
const BRAND = `<img class="brand" src="${BRAND_SRC}" alt="Chef" />`;

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }

  /* ---- minimized: branded Chef pill ---- */
  .fab { position: fixed; right: 24px; bottom: 24px; z-index: 2147483000;
    height: 52px; padding: 0 18px; border-radius: 999px; border: 0; cursor: pointer;
    display: inline-flex; align-items: center; gap: 10px;
    background: linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%);
    box-shadow: 0 10px 28px rgba(234,88,12,.30), 0 3px 8px rgba(0,0,0,.12);
    transition: transform 120ms ease, box-shadow 120ms ease; }
  .fab:hover { transform: translateY(-1px); box-shadow: 0 14px 34px rgba(234,88,12,.36), 0 4px 10px rgba(0,0,0,.14); }
  .fab .brand { display: block; height: 26px; width: auto; }
  .fab .spin { width: 15px; height: 15px; border: 2px solid rgba(234,88,12,.3); border-top-color: #ea580c;
    border-radius: 50%; animation: chef-spin .8s linear infinite; }
  .fab .dot { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px;
    border-radius: 999px; background: #ea580c; color: #fff; border: 2px solid #fff;
    font: 700 11px/1 ui-sans-serif, system-ui, sans-serif; display: inline-flex; align-items: center; justify-content: center; }

  /* ---- expanded card ---- */
  .bubble { position: fixed; right: 24px; bottom: 24px; z-index: 2147483000;
    width: 380px; max-width: calc(100vw - 48px); max-height: min(660px, calc(100vh - 48px));
    display: flex; flex-direction: column;
    font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2937; background: #fff; border: 1px solid #f3f4f6; border-radius: 16px;
    box-shadow: 0 20px 50px rgba(0,0,0,.18), 0 6px 12px rgba(0,0,0,.08); overflow: hidden; }

  .hdr { display: flex; align-items: center; gap: 11px; width: 100%; padding: 12px 14px;
    background: linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%); border-bottom: 1px solid #fed7aa; }
  .hdr .brand { height: 30px; width: auto; flex-shrink: 0; display: block; }
  .hdr .ttl { flex: 1; min-width: 0; }
  .hdr .ttl b { display: block; font-weight: 700; font-size: 14px; color: #9a3412;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hdr .ttl > span { font-size: 12px; color: #c2410c; }
  .hdr .ttl .spin { display: inline-block; width: 10px; height: 10px; margin-right: 5px; vertical-align: -1px;
    border: 2px solid rgba(234,88,12,.3); border-top-color: #ea580c; border-radius: 50%; animation: chef-spin .8s linear infinite; }
  .min { flex-shrink: 0; width: 26px; height: 26px; border: 0; border-radius: 8px; cursor: pointer;
    background: rgba(154,52,18,.08); color: #9a3412; font-size: 16px; line-height: 1; display: grid; place-items: center; }
  .min:hover { background: rgba(154,52,18,.16); }

  .body { overflow-y: auto; padding: 14px; background: #fffbf5; flex: 1; display: grid; gap: 16px; }
  .lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #9a3412; margin-bottom: 7px; }
  .lbl .spin { display: inline-block; width: 11px; height: 11px; margin-left: 6px; vertical-align: -1px;
    border: 2px solid rgba(234,88,12,.3); border-top-color: #ea580c; border-radius: 50%; animation: chef-spin .8s linear infinite; }
  .muted { font-size: 13px; color: #9a3412; margin: 0; }
  .divider { height: 1px; background: #fee9d6; margin: 0; }

  .todo { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; color: #1f2937; margin-bottom: 5px; }
  .todo.done { color: #6b7280; }
  .todo .t { flex: 1; min-width: 0; line-height: 1.4; overflow-wrap: anywhere; }
  .todo.done .t { text-decoration: line-through; }
  .tdot { flex-shrink: 0; width: 20px; height: 20px; border-radius: 999px; display: inline-flex;
    align-items: center; justify-content: center; font-size: 11px; font-weight: 700; margin-top: 1px; }
  .tdot.done { color: #15803d; background: #dcfce7; }
  .tdot.active { color: #ea580c; background: #fff7ed; animation: chef-pulse 1.4s ease-in-out infinite; }
  .tdot.pending { color: #9ca3af; background: #f3f4f6; }

  .prog { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; color: #374151; margin-bottom: 4px; }
  .prog.dim { opacity: .6; }
  .pdot { flex-shrink: 0; width: 16px; height: 16px; border-radius: 999px; display: inline-flex;
    align-items: center; justify-content: center; font-size: 10px; font-weight: 700; margin-top: 2px;
    color: #ea580c; background: #fff7ed; }
  .pdot.shipped { color: #15803d; background: #dcfce7; }
  .pdot.note { color: #6b7280; background: #f3f4f6; }

  .qcard { padding: 13px; border-radius: 12px; background: #fff; border: 1px solid #fed7aa; }
  .qcard .qt { font-size: 14px; color: #1f2937; line-height: 1.45; margin-bottom: 10px; }
  .upnext { font-size: 12px; color: #6b7280; line-height: 1.4; padding-left: 12px; border-left: 2px solid #fed7aa; margin-top: 6px; }

  textarea, input { width: 100%; box-sizing: border-box; background: #fff; color: #1f2937;
    border: 1px solid #fdba74; border-radius: 8px; padding: 8px; font: inherit; font-size: 13px; margin: 0; }
  textarea { resize: vertical; min-height: 60px; }
  textarea:focus, input:focus { outline: 2px solid #fb923c; outline-offset: 0; border-color: #fb923c; }
  .row-btns { display: flex; gap: 8px; margin-top: 8px; }
  button.act { flex: 1; background: #ea580c; color: #fff; border: 0; border-radius: 8px; padding: 9px 12px;
    font: inherit; font-weight: 600; cursor: pointer; }
  button.act:hover { background: #c2410c; }
  button.act:disabled { opacity: .5; cursor: not-allowed; }
  button.ghost { background: #fff; color: #9a3412; border: 1px solid #fed7aa; border-radius: 8px;
    padding: 9px 12px; font: inherit; font-weight: 600; cursor: pointer; }

  .req { display: flex; gap: 8px; align-items: flex-start; padding: 9px 10px; border-radius: 8px;
    border: 1px solid #f3f4f6; background: #fff; margin-bottom: 6px; }
  .req .vote { flex-shrink: 0; min-width: 36px; padding: 4px 6px; border: 1px solid #fed7aa; border-radius: 6px;
    background: #fff7ed; font-weight: 700; font-size: 12px; color: #9a3412; cursor: pointer; }
  .req .meta { flex: 1; min-width: 0; }
  .req .rt { font-weight: 600; font-size: 13px; color: #1f2937; line-height: 1.35; overflow-wrap: anywhere; }
  .req .rs { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }

  @keyframes chef-spin { to { transform: rotate(360deg); } }
  @keyframes chef-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .55; transform: scale(1.15); } }
`;

class ChefPanel extends HTMLElement {
  connectedCallback() {
    const url = this.getAttribute("convex-url");
    // NB: `this.prefix` is a read-only DOM getter on Element — assigning it
    // throws "Cannot set property prefix ... has only a getter". Use fnPrefix.
    this.fnPrefix = this.getAttribute("prefix") || "wow";
    this.viewer = this.getAttribute("viewer") || null;
    this.agentKey = this.getAttribute("agent-key") || undefined;
    this.open = this.getAttribute("open") === "1"; // start minimized by default
    this.snap = { todos: [], progress: [], refinements: [], counts: {} };
    this.requests = [];

    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><div class="wrap"></div>`;
    this.$wrap = root.querySelector(".wrap");

    if (!url) { this.$wrap.textContent = "chef-panel: missing convex-url"; return; }
    this.client = new ConvexClient(url);
    const auth = { viewer: this.viewer, agentKey: this.agentKey };
    this.client.onUpdate(ref(`${this.fnPrefix}:agentState`), auth, (s) => { this.snap = s || this.snap; this.render(); });
    this.client.onUpdate(ref(`${this.fnPrefix}:listPublicItems`), { viewer: this.viewer }, (r) => {
      this.requests = (r && r.page) || r || []; this.render();
    });
    this.render();
  }
  disconnectedCallback() { this.client && this.client.close(); }

  call(name, args) {
    return this.client.mutation(ref(`${this.fnPrefix}:${name}`), { ...args, viewer: this.viewer });
  }

  openQuestions() {
    return (this.snap.refinements || []).filter(
      (r) => r.state !== "rejected" && r.state !== "completed" && r.state !== "answered",
    );
  }
  isBuilding() {
    const t = this.snap.todos || [];
    return t.some((x) => x.status === "active") || (t.length > 0 && t.some((x) => x.status !== "done"));
  }

  render() {
    if (!this.open) return this.renderFab();
    this.renderPanel();
  }

  renderFab() {
    const building = this.isBuilding();
    const openCount = this.openQuestions().length;
    this.$wrap.innerHTML = `
      <button class="fab ${building ? "building" : ""}" id="fab" aria-label="Open Chef panel" title="Chef">
        ${BRAND}
        ${building ? `<span class="spin"></span>` : ""}
        ${openCount > 0 ? `<span class="dot">${openCount}</span>` : ""}
      </button>`;
    this.$wrap.querySelector("#fab").onclick = () => { this.open = true; this.render(); };
  }

  renderPanel() {
    const s = this.snap;
    const building = this.isBuilding();
    const open = this.openQuestions();
    const openCount = open.length;
    const title = openCount > 0 ? `Chef is asking (${openCount})` : "Building with Chef by Convex";
    const subtitle = building ? "Working on your app…" : "Ask, answer, or request a feature.";

    this.$wrap.innerHTML = `
      <div class="bubble">
        <div class="hdr ${building ? "building" : ""}">
          ${BRAND}
          <div class="ttl"><b>${esc(title)}</b><span>${building ? `<span class="spin"></span>` : ""}${esc(subtitle)}</span></div>
          <button class="min" id="min" aria-label="Minimize" title="Minimize">▾</button>
        </div>
        <div class="body"></div>
      </div>`;
    this.$wrap.querySelector("#min").onclick = () => { this.open = false; this.render(); };
    this.$body = this.$wrap.querySelector(".body");

    const sections = [];
    if (openCount > 0) sections.push(this.sectionAsking(open));
    sections.push(this.sectionBuild(building));
    sections.push(this.sectionRequest());
    this.$body.innerHTML = sections.join(`<div class="divider"></div>`);
    this.wireAsking(open);
    this.wireRequest();
  }

  // ---- sections (single scroll, no tabs) ----
  sectionAsking(open) {
    const q = open[0];
    const upnext = open.length > 1
      ? open.slice(1).map((r) => `<div class="upnext">${esc(r.title || r.text || "")}</div>`).join("")
      : "";
    return `<section>
      <div class="lbl">Chef is asking</div>
      <div class="qcard">
        <div class="qt">${esc(q.title || q.text || "")}</div>
        <textarea id="ans" placeholder="Type your answer…" rows="3"></textarea>
        <div class="row-btns">
          <button class="act" id="send">Send to Chef</button>
          <button class="ghost" id="skip">Skip</button>
        </div>
      </div>
      ${open.length > 1 ? `<div class="lbl" style="margin-top:12px">Up next (${open.length - 1})</div>${upnext}` : ""}
    </section>`;
  }

  sectionBuild(building) {
    const s = this.snap;
    const todos = s.todos || [];
    const progress = (s.progress || []).slice(0, 8);
    let inner;
    if (!todos.length && !progress.length) {
      inner = `<p class="muted">Chef hasn't started yet. Once they're working, you'll see the checklist here.</p>`;
    } else {
      const plan = todos.length ? todos.map((t) => {
        const st = t.status === "done" ? "done" : t.status === "active" ? "active" : "pending";
        const glyph = st === "done" ? "✓" : st === "active" ? "●" : "○";
        return `<div class="todo ${st}"><span class="tdot ${st}">${glyph}</span><span class="t">${esc(t.text)}</span></div>`;
      }).join("") : "";
      const recent = progress.length ? `<div class="lbl" style="margin-top:12px">Recent</div>` + progress.map((p, i) => {
        const k = p.kind === "shipped" ? "shipped" : p.kind === "note" ? "note" : "";
        const glyph = p.kind === "shipped" ? "✓" : p.kind === "note" ? "·" : "●";
        return `<div class="prog ${i === 0 ? "" : "dim"}"><span class="pdot ${k}">${glyph}</span><span>${esc(p.message)}</span></div>`;
      }).join("") : "";
      inner = (todos.length ? `<div class="lbl">Plan${building ? `<span class="spin"></span>` : ""}</div>` : "") + plan + recent;
    }
    return `<section>${inner}</section>`;
  }

  sectionRequest() {
    const reqs = this.requests || [];
    const list = reqs.map((r) => {
      const state = r.state || "requested";
      const color = state === "completed" ? "#15803d" : state === "inProgress" ? "#ea580c"
        : state === "rejected" ? "#9ca3af" : "#6b7280";
      const label = state === "inProgress" ? "Building…" : state === "completed" ? "Shipped"
        : state === "rejected" ? "Skipped" : "Queued";
      const votes = r.voteCount ?? r.stats?.totalAmount ?? 0;
      return `<div class="req">
        <button class="vote" data-up="${r._id || r.id}">▲ ${votes}</button>
        <div class="meta"><div class="rt">${esc(r.title)}</div><div class="rs" style="color:${color}">${label}</div></div>
      </div>`;
    }).join("");
    return `<section>
      <div class="lbl">What should Chef build next?</div>
      <textarea id="rt" placeholder="e.g., add a dark mode toggle" rows="2"></textarea>
      <div class="row-btns"><button class="act" id="sub">Send to Chef</button></div>
      ${reqs.length ? `<div class="lbl" style="margin-top:12px">In flight &amp; recent</div>${list}` : ""}
    </section>`;
  }

  // ---- wiring ----
  // ⌘/Ctrl+Enter on a textarea triggers its primary submit.
  onCmdEnter(ta, fn) {
    if (!ta) return;
    ta.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); fn(); }
    });
  }
  wireAsking(open) {
    if (!open.length) return;
    const q = open[0], qid = q._id || q.id;
    const ta = this.$body.querySelector("#ans");
    const send = this.$body.querySelector("#send");
    const skip = this.$body.querySelector("#skip");
    const submit = () => { const v = ta.value.trim(); if (v) this.call("answerRefinement", { id: qid, answer: v }); };
    if (send) send.onclick = submit;
    if (skip) skip.onclick = () => this.call("skipRefinement", { id: qid });
    this.onCmdEnter(ta, submit);
  }
  wireRequest() {
    this.$body.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => this.call("upvoteRequest", { id: b.dataset.up }));
    const ta = this.$body.querySelector("#rt");
    const submitReq = () => {
      const text = ta.value.trim();
      if (!text) return;
      const nl = text.indexOf("\n");
      const title = nl >= 0 ? text.slice(0, nl).trim() : text;
      const description = nl >= 0 ? text.slice(nl + 1).trim() : "";
      this.call("submitRequest", { title, description });
      ta.value = "";
    };
    const sub = this.$body.querySelector("#sub");
    if (sub) sub.onclick = submitReq;
    this.onCmdEnter(ta, submitReq);
  }
}
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])); }
if (!customElements.get("chef-panel")) customElements.define("chef-panel", ChefPanel);
