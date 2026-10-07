// chef-panel.browser.js — the floating "Chef" feedback panel, as a dependency-free
// web component. Ships in @convex-dev/feedback (`@convex-dev/feedback/panel`).
//
//   <script type="module" src=".../chef-panel.browser.js"></script>
//   <chef-panel convex-url="https://<deployment>.convex.cloud" prefix="chef"></chef-panel>
//   <script>document.querySelector("chef-panel").setAuth(fetchToken)</script>
//
// It calls the functions `exposeChefApi` creates (see src/chef.ts), under the
// module named by `prefix` (default "chef" → convex/chef.ts). Tap the bubble to
// open the panel; LONG-PRESS (or right-click) it to snapshot the page and send a
// screenshot + voice-note request. Admins also see "Waiting for your approval".
//
// Auth: hand the panel a token fetcher with `panel.setAuth(fetchToken)` — same
// signature as ConvexClient.setAuth: ({ forceRefreshToken }) => Promise<string|null>.
// Without it the panel is read-only (sending requires a signed-in user).
//
// File name: the multiple dots are deliberate. This file lives inside the
// component's directory, and Convex's bundler skips files whose names contain
// more than one dot — otherwise it would try to deploy this browser script as
// a component module (and reject the hyphen) on every push.

// Convex's browser client is loaded at runtime from esm.sh so this file has no
// bare imports: it works from a plain <script type="module"> and is left alone
// by app bundlers (webpackIgnore / turbopackIgnore / @vite-ignore).
const CONVEX_VERSION = "1.35.1";
const CONVEX_BROWSER = `https://esm.sh/convex@${CONVEX_VERSION}/browser`;
const CONVEX_SERVER = `https://esm.sh/convex@${CONVEX_VERSION}/server`;
let convexLib = null;
function loadConvex() {
  convexLib = convexLib || Promise.all([
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ CONVEX_BROWSER),
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ CONVEX_SERVER),
  ]).then(([browser, server]) => ({ ConvexClient: browser.ConvexClient, makeFunctionReference: server.makeFunctionReference }));
  return convexLib;
}

// Official Chef brand mark (toque + "Chef" wordmark).
const BRAND_SRC = "https://chef.convex.dev/chef.svg";
const BRAND = `<img class="brand" src="${BRAND_SRC}" alt="Chef" />`;

// Screenshot lib: loaded lazily (first capture) from a CDN, pinned.
const SHOT_LIB = "https://cdn.jsdelivr.net/npm/modern-screenshot@4.7.0/+esm";
const LONG_PRESS_MS = 500;
const MAX_SHOTS = 4;
const MAX_SHOT_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_REC_MS = 5 * 60 * 1000;

const STATE_LABEL = {
  submitted: ["Waiting for approval", "#b45309"],
  requested: ["Queued", "#6b7280"],
  planned: ["Queued", "#6b7280"],
  inProgress: ["Building…", "#ea580c"],
  completed: ["Shipped", "#15803d"],
  rejected: ["Declined", "#9ca3af"],
};

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
  .fab .mic { position: absolute; left: -6px; bottom: -6px; width: 24px; height: 24px; border-radius: 999px;
    display: inline-flex; align-items: center; justify-content: center; background: #ea580c; color: #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,.25); }
  .fab .mic:hover { background: #c2410c; }
  .fab .mic svg { width: 13px; height: 13px; }
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

  /* ---- screenshot + voice composer (long-press / right-click the bubble) ---- */
  .fab { -webkit-touch-callout: none; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
  .fab.pressing { transform: scale(.96); box-shadow: 0 0 0 6px rgba(234,88,12,.18), 0 10px 28px rgba(234,88,12,.30); }
  .comp { position: fixed; right: 24px; bottom: 24px; z-index: 2147483001; width: 400px; max-width: calc(100vw - 32px);
    max-height: min(720px, calc(100vh - 32px)); display: flex; flex-direction: column; overflow: hidden;
    font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2937; background: #fffbf5; border: 1px solid #fed7aa; border-radius: 16px;
    box-shadow: 0 20px 50px rgba(0,0,0,.22), 0 6px 12px rgba(0,0,0,.08); }
  .comp .cbody { overflow-y: auto; padding: 14px; display: grid; gap: 12px; }
  .shots { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .shot { position: relative; width: 84px; height: 60px; border-radius: 8px; overflow: hidden; border: 1px solid #fdba74;
    background: #fff; cursor: zoom-in; padding: 0; }
  .shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .shot .x { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 999px; border: 0;
    background: rgba(17,24,39,.75); color: #fff; font-size: 11px; line-height: 18px; cursor: pointer; padding: 0; }
  .shot .pen { position: absolute; left: 3px; bottom: 3px; font-size: 10px; background: rgba(255,255,255,.85);
    color: #9a3412; border-radius: 4px; padding: 0 4px; font-weight: 600; }
  .addshot { width: 84px; height: 60px; border-radius: 8px; border: 1px dashed #fb923c; background: #fff7ed;
    color: #c2410c; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
  .capturing { font-size: 12px; color: #9a3412; display: inline-flex; align-items: center; gap: 6px; }
  .capturing .spin, .rec .spin { display: inline-block; width: 11px; height: 11px; border: 2px solid rgba(234,88,12,.3);
    border-top-color: #ea580c; border-radius: 50%; animation: chef-spin .8s linear infinite; }
  .rec { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: #fff; border: 1px solid #fed7aa; }
  .rec .rdot { width: 10px; height: 10px; border-radius: 999px; background: #dc2626; flex-shrink: 0; animation: chef-pulse 1.2s ease-in-out infinite; }
  .rec .rdot.off { background: #9ca3af; animation: none; }
  .rec canvas { flex: 1; min-width: 0; height: 28px; }
  .rec .tm { font-variant-numeric: tabular-nums; font-size: 12px; color: #6b7280; }
  .rec button { border: 1px solid #fed7aa; background: #fff7ed; color: #9a3412; border-radius: 6px; padding: 4px 8px;
    font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .rec audio { flex: 1; min-width: 0; height: 30px; }
  .live { font-size: 12px; color: #6b7280; font-style: italic; min-height: 1em; }
  .err { font-size: 12px; color: #b91c1c; }
  .note { font-size: 12px; color: #9a3412; }
  .req .att { display: flex; gap: 4px; align-items: center; margin-top: 5px; }
  .req .att a { display: block; width: 36px; height: 26px; border-radius: 4px; overflow: hidden; border: 1px solid #fed7aa; }
  .req .att img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .req .att .mic { font-size: 13px; text-decoration: none; }
  .ann { position: fixed; inset: 0; z-index: 2147483002; background: rgba(17,24,39,.82); display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px; padding: 16px; font: 13px/1.45 ui-sans-serif, system-ui, sans-serif; }
  .ann canvas { max-width: 100%; max-height: calc(100vh - 90px); background: #fff; border-radius: 6px; cursor: crosshair; touch-action: none; }
  .ann .bar { display: flex; gap: 8px; }
  .ann .bar button { border: 0; border-radius: 8px; padding: 8px 14px; font: inherit; font-weight: 600; cursor: pointer; background: #fff; color: #1f2937; }
  .ann .bar button.ok { background: #ea580c; color: #fff; }
  .ann .hint { color: #fed7aa; font-size: 12px; }

  @keyframes chef-spin { to { transform: rotate(360deg); } }
  @keyframes chef-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .55; transform: scale(1.15); } }
`;

// Approvals, "your requests", inline errors.
const CSS_EXTRA = `
  .appr { padding: 11px; border-radius: 12px; background: #fff; border: 1px solid #fde68a; margin-bottom: 8px; display: grid; gap: 7px; }
  .appr .at { font-weight: 600; font-size: 13px; color: #1f2937; overflow-wrap: anywhere; }
  .appr .who { font-size: 11px; color: #92400e; }
  .appr .ad { font-size: 12px; color: #374151; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 7.5em; overflow: auto; }
  .appr .ashots { display: flex; gap: 6px; flex-wrap: wrap; }
  .appr .ashots a { display: block; width: 72px; height: 50px; border-radius: 6px; overflow: hidden; border: 1px solid #fed7aa; }
  .appr .ashots img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .appr audio { width: 100%; height: 32px; }
  .appr .row-btns { margin-top: 0; }
  button.no { background: #fff; color: #b91c1c; border: 1px solid #fecaca; border-radius: 8px; padding: 9px 12px;
    font: inherit; font-weight: 600; cursor: pointer; flex: 1; }
  button.no:hover { background: #fef2f2; }
  .mine { display: flex; gap: 8px; align-items: baseline; font-size: 12px; padding: 4px 0; }
  .mine .mt { flex: 1; min-width: 0; color: #1f2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mine .ms { flex-shrink: 0; font-size: 11px; font-weight: 600; }
  .flash { font-size: 12px; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 7px 9px; }
`;

const Base = typeof HTMLElement === "undefined" ? class {} : HTMLElement;

export class ChefPanelElement extends Base {
  connectedCallback() {
    if (this.shadowRoot) {
      // Re-attached: keep state; reconnect if a real removal closed the client.
      const url = this.getAttribute("convex-url");
      if (!this.client && url) loadConvex().then((lib) => this.connect(lib, url)).catch(() => {});
      return;
    }
    // NB: `this.prefix` is a read-only DOM getter on Element — use fnPrefix.
    this.fnPrefix = this.getAttribute("prefix") || "chef";
    this.open = this.getAttribute("open") === "1"; // start minimized by default
    this.snap = { todos: [], progress: [], refinements: [] };
    this.requests = [];
    this.mineList = [];
    this.pending = []; // awaiting approval (admins only; [] for everyone else)
    this.answered = {}; // qid -> answer (optimistic, until the agent resolves it)
    this.reviewed = {}; // id -> true (optimistic, until the list updates)
    this.attachments = {}; // itemId -> [{ kind, url, mimeType }]
    // Screenshot + voice requests need generateUploadUrl / submitRequestWithMedia /
    // listAttachments. null = unknown, true = present, false = missing.
    this.mediaOk = null;
    this.flash = "";
    this.draftKey = `chef-panel:draft:${this.fnPrefix}`;

    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}${CSS_EXTRA}</style><div class="wrap"></div>`;
    this.$wrap = root.querySelector(".wrap");

    const url = this.getAttribute("convex-url");
    if (!url) { this.$wrap.textContent = "chef-panel: missing convex-url"; return; }
    this.render();
    loadConvex().then((lib) => this.connect(lib, url)).catch((e) => {
      this.$wrap.textContent = `chef-panel: couldn't load Convex (${errMsg(e)})`;
    });
  }

  connect({ ConvexClient, makeFunctionReference }, url) {
    if (!this.isConnected || this.client) return;
    this._attKey = null;
    this.ref = (name) => makeFunctionReference(`${this.fnPrefix}:${name}`);
    this.client = new ConvexClient(url);
    if (this._fetchToken) this.client.setAuth(this._fetchToken);
    const watch = (name, args, onValue) =>
      this.client.onUpdate(this.ref(name), args, onValue, (e) => {
        if (!isMissingFn(e)) console.warn(`chef-panel: ${this.fnPrefix}:${name}`, e);
      });
    watch("agentState", {}, (s) => { this.snap = s || this.snap; this.render(); });
    watch("listPublicItems", {}, (r) => {
      this.requests = (r && r.page) || r || []; this.watchAttachments(); this.render();
    });
    watch("mine", {}, (r) => { this.mineList = r || []; this.render(); });
    watch("awaitingApproval", {}, (r) => { this.pending = r || []; this.render(); });
    // Feature-detect the media functions with a harmless query.
    this.client.query(this.ref("listAttachments"), { itemIds: [] })
      .then(() => { this.mediaOk = true; this.watchAttachments(); this.render(); })
      .catch((e) => { this.mediaOk = !isMissingFn(e); this.render(); });
  }

  disconnectedCallback() {
    // Only tear down if we're really gone (not just moved in the DOM).
    queueMicrotask(() => {
      if (this.isConnected) return;
      if (this.$comp) this.closeComposer();
      if (this.client) { this.client.close(); this.client = null; }
    });
  }

  /**
   * Hand the panel a token fetcher so calls arrive authenticated (the server
   * then knows who is filing). Same signature as ConvexClient.setAuth:
   * ({ forceRefreshToken }) => Promise<string|null>. Safe to call any time.
   */
  setAuth(fetchToken) {
    this._fetchToken = fetchToken;
    if (this.client) this.client.setAuth(fetchToken);
  }

  /** Drop the auth token (signed out). */
  clearAuth() {
    this._fetchToken = null;
    if (this.client) this.client.setAuth(async () => null);
  }

  watchAttachments() {
    if (!this.mediaOk || !this.client) return;
    const ids = (this.requests || []).map((r) => r._id || r.id).filter(Boolean).slice(0, 50);
    const key = ids.join(",");
    if (key === this._attKey) return;
    this._attKey = key;
    if (this._attUnsub) { this._attUnsub(); this._attUnsub = null; }
    if (!ids.length) { this.attachments = {}; return; }
    const unsub = this.client.onUpdate(this.ref("listAttachments"), { itemIds: ids }, (rows) => {
      const m = {};
      for (const r of rows || []) m[r.itemId] = r.attachments || [];
      this.attachments = m;
      this.render();
    }, () => {});
    this._attUnsub = typeof unsub === "function" ? unsub : unsub && unsub.unsubscribe ? () => unsub.unsubscribe() : null;
  }

  // Mutations surface their errors inline ("Sign in to …", "Item is under review", …).
  call(name, args) {
    if (!this.client) return Promise.reject(new Error("Chef isn't connected yet"));
    return this.client.mutation(this.ref(name), args).catch((e) => {
      this.flash = isUnauth(e) ? "Sign in to send requests to Chef." : errMsg(e);
      this.render();
      throw e;
    });
  }

  openQuestions() {
    // Exclude server-resolved states AND optimistically-answered ones, so the
    // header count, bubble dot, and asking section drop the moment the user
    // answers — not only once the agent flips the server state.
    return (this.snap.refinements || []).filter(
      (r) =>
        r.state !== "rejected" &&
        r.state !== "completed" &&
        r.state !== "answered" &&
        r.state !== "skipped" &&
        !this.answered[r._id || r.id],
    );
  }
  openApprovals() {
    return (this.pending || []).filter((p) => !this.reviewed[p.id]);
  }
  isBuilding() {
    const t = this.snap.todos || [];
    return t.some((x) => x.status === "active") || (t.length > 0 && t.some((x) => x.status !== "done"));
  }

  render() {
    if (!this.$wrap) return;
    // Don't cut off a voice note someone is listening to; re-render when it stops.
    const playing = Array.from(this.$wrap.querySelectorAll("audio")).find((a) => !a.paused);
    if (playing) {
      if (!this._deferred) {
        this._deferred = true;
        playing.addEventListener("pause", () => { this._deferred = false; this.render(); }, { once: true });
      }
      return;
    }
    if (!this.open) return this.renderFab();
    this.renderPanel();
  }

  renderFab() {
    const building = this.isBuilding();
    const badge = this.openQuestions().length + this.openApprovals().length;
    this.$wrap.innerHTML = `
      <button class="fab ${building ? "building" : ""}" id="fab" aria-label="Open Chef panel" title="Chef">
        ${BRAND}
        ${building ? `<span class="spin"></span>` : ""}
        ${badge > 0 ? `<span class="dot">${badge}</span>` : ""}
        ${this.mediaOk ? `<span class="mic" id="fabmic" title="Tell Chef what to change: screenshot + voice note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg></span>` : ""}
      </button>`;
    const fab = this.$wrap.querySelector("#fab");
    let timer = null, fired = false, x0 = 0, y0 = 0;
    const cancel = () => { if (timer) clearTimeout(timer); timer = null; fab.classList.remove("pressing"); };
    fab.addEventListener("pointerdown", (e) => {
      if (this.mediaOk === false || e.button > 0) return;
      fired = false; x0 = e.clientX; y0 = e.clientY;
      fab.classList.add("pressing");
      timer = setTimeout(() => { timer = null; fired = true; fab.classList.remove("pressing"); this.startMediaRequest(); }, LONG_PRESS_MS);
    });
    fab.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) cancel(); });
    fab.addEventListener("pointerup", cancel);
    fab.addEventListener("pointerleave", cancel);
    fab.addEventListener("pointercancel", cancel);
    fab.addEventListener("contextmenu", (e) => {
      if (this.mediaOk === false) return; // keep the native menu when media isn't available
      e.preventDefault();
      if (!fired) { cancel(); fired = true; this.startMediaRequest(); }
    });
    fab.onclick = (e) => {
      if (fired) { e.preventDefault(); fired = false; return; } // the long-press already acted
      if (e.target.closest && e.target.closest("#fabmic")) { e.preventDefault(); this.startMediaRequest(); return; }
      this.open = true; this.render();
    };
    if (this.mediaOk) fab.title = "Chef — long-press (or right-click) to send a screenshot + voice note";
  }

  renderPanel() {
    const building = this.isBuilding();
    const open = this.openQuestions();
    const approvals = this.openApprovals();
    const title = open.length > 0 ? `Chef is asking (${open.length})`
      : approvals.length > 0 ? `${approvals.length} waiting for approval` : "Building with Chef by Convex";
    const subtitle = building ? "Working on your app…" : "Ask, answer, or request a feature.";

    // Keep what's been typed (and the caret) across re-renders.
    const prev = {};
    for (const id of ["rt", "ans"]) {
      const el = this.$wrap.querySelector(`#${id}`);
      if (el) prev[id] = { value: el.value, focused: this.shadowRoot.activeElement === el, start: el.selectionStart, end: el.selectionEnd };
    }
    const scroll = this.$wrap.querySelector(".body")?.scrollTop ?? 0;

    this.$wrap.innerHTML = `
      <div class="bubble">
        <div class="hdr ${building ? "building" : ""}">
          ${BRAND}
          <div class="ttl"><b>${esc(title)}</b><span>${building ? `<span class="spin"></span>` : ""}${esc(subtitle)}</span></div>
          <button class="min" id="min" aria-label="Minimize" title="Minimize">▾</button>
        </div>
        <div class="body"></div>
      </div>`;
    this.$wrap.querySelector("#min").onclick = () => { this.open = false; this.flash = ""; this.render(); };
    this.$body = this.$wrap.querySelector(".body");

    const sections = [];
    if (this.flash) sections.push(`<div class="flash">${esc(this.flash)}</div>`);
    if (approvals.length) sections.push(this.sectionApprovals(approvals));
    if (open.length || Object.keys(this.answered).length) sections.push(this.sectionAsking(open));
    sections.push(this.sectionBuild(building));
    sections.push(this.sectionRequest());
    this.$body.innerHTML = sections.join(`<div class="divider"></div>`);
    this.wireApprovals();
    this.wireAsking(open);
    this.wireRequest();

    for (const [id, p] of Object.entries(prev)) {
      const el = this.$body.querySelector(`#${id}`);
      if (!el) continue;
      el.value = p.value;
      if (p.focused) { el.focus(); try { el.setSelectionRange(p.start, p.end); } catch {} }
    }
    const rt = this.$body.querySelector("#rt");
    if (rt && !prev.rt) rt.value = readDraft(this.draftKey);
    this.$body.scrollTop = scroll;
  }

  // ---- sections (single scroll, no tabs) ----
  sectionApprovals(items) {
    const cards = items.map((p) => {
      const shots = (p.attachments || []).filter((a) => a.kind === "screenshot" && a.url);
      const audio = (p.attachments || []).find((a) => a.kind === "audio" && a.url);
      return `<div class="appr">
        <div><div class="at">${esc(p.title)}</div><div class="who">${esc(p.from || "Someone")} · ${esc(ago(p.at))}</div></div>
        ${p.description ? `<div class="ad">${esc(p.description)}</div>` : ""}
        ${shots.length ? `<div class="ashots">${shots.map((a) =>
          `<a href="${esc(a.url)}" target="_blank" rel="noopener" title="Open screenshot"><img src="${esc(a.url)}" alt="Screenshot" loading="lazy" /></a>`).join("")}</div>` : ""}
        ${audio ? `<audio controls preload="none" src="${esc(audio.url)}"></audio>` : ""}
        <div class="row-btns">
          <button class="act" data-approve="${esc(p.id)}">Approve</button>
          <button class="no" data-reject="${esc(p.id)}">Reject</button>
        </div>
      </div>`;
    }).join("");
    return `<section><div class="lbl">Waiting for your approval (${items.length})</div>${cards}</section>`;
  }

  sectionAsking(open) {
    const answeredList = Object.entries(this.answered);
    const askedBlock = open.length ? (() => {
      const q = open[0];
      const upnext = open.slice(1).map((r) => `<div class="upnext">${esc(r.title || r.text || "")}</div>`).join("");
      return `<div class="qcard">
          <div class="qt">${esc(q.title || q.text || "")}</div>
          <textarea id="ans" placeholder="Type your answer…" rows="3"></textarea>
          <div class="row-btns">
            <button class="act" id="send">Send to Chef</button>
            <button class="ghost" id="skip">Skip</button>
          </div>
        </div>
        ${open.length > 1 ? `<div class="lbl" style="margin-top:12px">Up next (${open.length - 1})</div>${upnext}` : ""}`;
    })() : "";
    const answeredBlock = answeredList.length ? `<div class="lbl" style="margin-top:12px">Answered</div>` + answeredList.map(([, a]) =>
      `<div class="qcard" style="border-color:#bbf7d0;background:#f0fdf4"><div style="color:#15803d;font-size:13px">✓ You: ${esc(a)}</div></div>`).join("") : "";
    // No section label — the header already says "Chef is asking (N)".
    return `<section>${askedBlock || (answeredBlock ? `<p class="muted">No open questions.</p>` : "")}${answeredBlock}</section>`;
  }

  sectionBuild(building) {
    const s = this.snap;
    const todos = s.todos || [];
    const progress = (s.progress || []).slice(0, 8);
    let inner;
    if (!todos.length && !progress.length) {
      inner = `<p class="muted">Tell Chef what to build or fix — your requests show up below.</p>`;
    } else {
      const plan = todos.map((t) => {
        const st = t.status === "done" ? "done" : t.status === "active" ? "active" : "pending";
        const glyph = st === "done" ? "✓" : st === "active" ? "●" : "○";
        return `<div class="todo ${st}"><span class="tdot ${st}">${glyph}</span><span class="t">${esc(t.text)}</span></div>`;
      }).join("");
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
    const publicIds = new Set(reqs.map((r) => r._id || r.id));
    // Your own requests that aren't on the public list (e.g. waiting for approval).
    const mine = (this.mineList || []).filter((m) => !publicIds.has(m._id)).slice(0, 6);
    const mineHtml = mine.map((m) => {
      const [label, color] = STATE_LABEL[m.state] || ["Queued", "#6b7280"];
      const media = [m.screenshotCount ? `📸${m.screenshotCount > 1 ? "×" + m.screenshotCount : ""}` : "", m.hasAudio ? "🎙" : ""].join("");
      return `<div class="mine"><span class="mt">${esc(m.title)}</span>${media ? `<span>${media}</span>` : ""}<span class="ms" style="color:${color}">${esc(label)}</span></div>`;
    }).join("");
    const list = reqs.map((r) => {
      const [label, color] = STATE_LABEL[r.state || "requested"] || ["Queued", "#6b7280"];
      const votes = r.voteCount ?? r.stats?.totalAmount ?? 0;
      const att = this.attachments[r._id || r.id] || [];
      const shots = att.filter((a) => a.kind === "screenshot" && a.url);
      const audio = att.find((a) => a.kind === "audio" && a.url);
      const attHtml = att.length ? `<div class="att">${shots.map((a) =>
        `<a href="${esc(a.url)}" target="_blank" rel="noopener" title="Screenshot"><img src="${esc(a.url)}" alt="Screenshot" loading="lazy" /></a>`).join("")}${audio
        ? `<a class="mic" href="${esc(audio.url)}" target="_blank" rel="noopener" title="Voice note" style="border:0;width:auto;height:auto">🎙</a>` : ""}</div>` : "";
      return `<div class="req">
        <button class="vote" data-up="${esc(r._id || r.id)}" title="Vote">▲ ${votes}</button>
        <div class="meta"><div class="rt">${esc(r.title)}</div><div class="rs" style="color:${color}">${label}</div>${attHtml}</div>
      </div>`;
    }).join("");
    return `<section>
      <div class="lbl">What should Chef build next?</div>
      <textarea id="rt" placeholder="e.g., add a dark mode toggle" rows="2"></textarea>
      <div class="row-btns"><button class="act" id="sub">Send to Chef</button>${this.mediaOk
        ? `<button class="ghost" id="media" title="Screenshot this page and describe it out loud (or long-press the Chef bubble)">📸 + 🎙</button>` : ""}</div>
      ${mine.length ? `<div class="lbl" style="margin-top:12px">Your requests</div>${mineHtml}` : ""}
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
  wireApprovals() {
    const act = (id, approve) => {
      this.reviewed[id] = true; this.flash = ""; this.render();
      this.call("review", { id, approve }).catch(() => { delete this.reviewed[id]; this.render(); });
    };
    this.$body.querySelectorAll("[data-approve]").forEach((b) => b.onclick = () => act(b.dataset.approve, true));
    this.$body.querySelectorAll("[data-reject]").forEach((b) => b.onclick = () => act(b.dataset.reject, false));
  }
  wireAsking(open) {
    if (!open.length) return;
    const q = open[0], qid = q._id || q.id;
    const ta = this.$body.querySelector("#ans");
    const submit = () => {
      const v = ta.value.trim();
      if (!v) return;
      this.answered[qid] = v; ta.value = ""; this.flash = ""; this.render();
      this.call("answerRefinement", { id: qid, answer: v }).catch(() => { delete this.answered[qid]; this.render(); });
    };
    const send = this.$body.querySelector("#send");
    const skip = this.$body.querySelector("#skip");
    if (send) send.onclick = submit;
    if (skip) skip.onclick = () => this.call("skipRefinement", { id: qid }).catch(() => {});
    this.onCmdEnter(ta, submit);
  }
  wireRequest() {
    this.$body.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => this.call("upvoteRequest", { id: b.dataset.up }).catch(() => {}));
    const ta = this.$body.querySelector("#rt");
    ta.addEventListener("input", () => writeDraft(this.draftKey, ta.value));
    const submitReq = () => {
      const text = ta.value.trim();
      if (!text) return;
      const nl = text.indexOf("\n");
      const title = nl >= 0 ? text.slice(0, nl).trim() : text;
      const description = nl >= 0 ? text.slice(nl + 1).trim() : "";
      this.flash = "";
      this.call("submitRequest", { title, description }).then(() => {
        writeDraft(this.draftKey, "");
        const el = this.$body && this.$body.querySelector("#rt");
        if (el && el.value.trim() === text) el.value = "";
        this.render();
      }).catch(() => {});
    };
    const sub = this.$body.querySelector("#sub");
    if (sub) sub.onclick = submitReq;
    const media = this.$body.querySelector("#media");
    if (media) media.onclick = () => this.startMediaRequest(ta.value.trim());
    this.onCmdEnter(ta, submitReq);
  }

  // ===================== screenshot + voice composer =====================
  // Long-press / right-click the bubble (or the 📸+🎙 button): snapshot the
  // page (DOM render, no screen-share prompt), then open a composer that is
  // already recording a voice note with a live transcript.

  async startMediaRequest(prefill = "") {
    if (this.$comp) return; // already composing
    this.c = { shots: [], audio: null, transcript: "", interim: "", titleEdited: false, descEdited: false,
      recording: false, sending: false, error: "", note: "", capturing: true };
    this.$comp = document.createElement("div");
    this.$comp.className = "comp";
    this.shadowRoot.appendChild(this.$comp);
    this.$wrap.style.display = "none";
    this.renderComposer();
    if (!this._fetchToken) this.c.note = "Sending needs a signed-in user — sign in first.";
    if (prefill) { this.c.title = prefill; this.c.titleEdited = true; }
    this.renderComposer();
    // Capture first (before the mic prompt can cover the page), then record.
    await this.addScreenshot();
    this.startRecording();
  }

  closeComposer() {
    this.stopRecording(true);
    if (this.$ann) { this.$ann.remove(); this.$ann = null; }
    for (const s of (this.c && this.c.shots) || []) URL.revokeObjectURL(s.url);
    if (this.c && this.c.audio) URL.revokeObjectURL(this.c.audio.url);
    if (this.$comp) { this.$comp.remove(); this.$comp = null; }
    this.c = null;
    this.$wrap.style.display = "";
    this.render();
  }

  async addScreenshot() {
    const c = this.c;
    if (!c || c.shots.length >= MAX_SHOTS) return;
    c.capturing = true; this.renderComposer();
    try {
      const blob = await capturePage();
      if (this.c !== c) return;
      c.shots.push({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      if (this.c === c) c.error = "Couldn't capture the page" + (e && e.message ? ` (${e.message})` : "") + ".";
    } finally {
      if (this.c === c) { c.capturing = false; this.renderComposer(); }
    }
  }

  async startRecording() {
    const c = this.c;
    if (!c || c.recording) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) { c.note = "Voice recording isn't supported here — type instead."; this.renderComposer(); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { if (this.c === c) { c.note = "Microphone unavailable — type your request instead."; this.renderComposer(); } return; }
    if (this.c !== c) { stream.getTracks().forEach((t) => t.stop()); return; }
    if (c.audio) { URL.revokeObjectURL(c.audio.url); c.audio = null; }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    c.rec = { stream, rec, chunks, startedAt: Date.now(), done: new Promise((res) => { rec.onstop = res; }) };
    rec.start(1000);
    c.recording = true;
    // Waveform
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC(); const src = ac.createMediaStreamSource(stream); const an = ac.createAnalyser();
      an.fftSize = 512; src.connect(an); c.rec.ac = ac; c.rec.an = an;
    } catch { /* waveform is cosmetic */ }
    // Live transcript (Web Speech; Chrome/Safari). Restarts across silences.
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const base = c.transcript ? c.transcript + " " : "";
      let finals = "";
      const sr = new SR();
      sr.continuous = true; sr.interimResults = true; sr.lang = navigator.language || "en-US";
      sr.onresult = (ev) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finals += r[0].transcript.trim() + " "; else interim += r[0].transcript;
        }
        if (this.c !== c) return;
        c.transcript = (base + finals).trim(); c.interim = interim;
        this.syncFromTranscript();
      };
      sr.onerror = () => {};
      sr.onend = () => { if (this.c === c && c.recording) { try { sr.start(); } catch {} } };
      try { sr.start(); c.rec.sr = sr; } catch {}
    } else {
      c.note = "Live transcript isn't available in this browser — your voice note is still attached.";
    }
    c.rec.limit = setTimeout(() => this.stopRecording(), MAX_REC_MS);
    this.renderComposer();
    this.drawWave();
  }

  async stopRecording(discard = false) {
    const c = this.c;
    if (!c || !c.rec) return;
    const r = c.rec; c.rec = null; c.recording = false; c.interim = "";
    clearTimeout(r.limit);
    try { r.sr && r.sr.stop(); } catch {}
    try { if (r.rec.state !== "inactive") r.rec.stop(); } catch {}
    await r.done;
    r.stream.getTracks().forEach((t) => t.stop());
    try { r.ac && r.ac.close(); } catch {}
    if (discard || this.c !== c) return;
    const type = (r.rec.mimeType || r.chunks[0]?.type || "audio/webm").split(";")[0];
    const blob = new Blob(r.chunks, { type });
    if (blob.size > 0) c.audio = { blob, url: URL.createObjectURL(blob), ms: Date.now() - r.startedAt };
    if (blob.size > MAX_AUDIO_BYTES) { c.error = "Voice note is too long (max 25 MB)."; c.audio = null; }
    this.syncFromTranscript();
    this.renderComposer();
  }

  drawWave() {
    const c = this.c;
    if (!c || !c.rec || !this.$comp) return;
    if (c.rec.raf) return; // one loop per recording
    c.rec.raf = requestAnimationFrame(() => { if (c.rec) c.rec.raf = 0; this.drawWave(); });
    const cv = this.$comp.querySelector("#wave");
    const tm = this.$comp.querySelector("#tm");
    if (tm) tm.textContent = fmtMs(Date.now() - c.rec.startedAt);
    if (cv && c.rec.an) {
      const w = (cv.width = cv.clientWidth * (window.devicePixelRatio || 1));
      const h = (cv.height = cv.clientHeight * (window.devicePixelRatio || 1));
      const g = cv.getContext("2d"); const data = new Uint8Array(c.rec.an.fftSize);
      c.rec.an.getByteTimeDomainData(data);
      g.clearRect(0, 0, w, h); g.fillStyle = "#ea580c";
      const bars = 40, step = Math.floor(data.length / bars), bw = w / bars;
      for (let i = 0; i < bars; i++) {
        let peak = 0;
        for (let j = 0; j < step; j++) peak = Math.max(peak, Math.abs(data[i * step + j] - 128));
        const bh = Math.max(2, (peak / 128) * h * 1.6);
        g.fillRect(i * bw + bw * 0.2, (h - Math.min(h, bh)) / 2, bw * 0.6, Math.min(h, bh));
      }
    }
  }

  // Title = first sentence of what was said; description = the transcript —
  // until the user edits either field by hand.
  syncFromTranscript() {
    const c = this.c; if (!c || !this.$comp) return;
    const text = (c.transcript + (c.interim ? " " + c.interim : "")).trim();
    const ti = this.$comp.querySelector("#ct"), de = this.$comp.querySelector("#cd"), live = this.$comp.querySelector("#live");
    if (!c.titleEdited) { c.title = firstSentence(text); if (ti) ti.value = c.title; }
    if (!c.descEdited) { c.desc = text; if (de) de.value = c.desc; }
    if (live) live.textContent = c.interim ? `…${c.interim}` : "";
  }

  renderComposer() {
    const c = this.c; if (!c || !this.$comp) return;
    const shots = c.shots.map((s, i) => `<div class="shot" data-ann="${i}" role="button" tabindex="0" title="Click to draw on it">
        <img src="${s.url}" alt="Screenshot ${i + 1}" /><span class="pen">✎ mark up</span>
        <button class="x" data-rm="${i}" aria-label="Remove screenshot">✕</button></div>`).join("");
    const canAdd = c.shots.length < MAX_SHOTS && !c.capturing;
    const recUi = c.recording
      ? `<div class="rec"><span class="rdot"></span><canvas id="wave"></canvas><span class="tm" id="tm">0:00</span><button id="stop">Stop</button></div>`
      : c.audio
        ? `<div class="rec"><span class="rdot off"></span><audio controls src="${c.audio.url}"></audio><button id="rerec" title="Record again">↺</button><button id="rmaudio" title="Remove voice note">✕</button></div>`
        : `<div class="rec"><span class="rdot off"></span><span class="tm" style="flex:1">No voice note</span><button id="record">🎙 Record</button></div>`;
    this.$comp.innerHTML = `
      <div class="hdr">${BRAND}<div class="ttl"><b>Show Chef what you mean</b><span>${c.recording ? "Listening — just describe it" : "Screenshot + voice note"}</span></div>
        <button class="min" id="cx" aria-label="Cancel" title="Cancel">✕</button></div>
      <div class="cbody">
        <div class="shots">${shots}${c.capturing ? `<span class="capturing"><span class="spin"></span>Capturing page…</span>` : ""}${canAdd ? `<button class="addshot" id="addshot">+ ${c.shots.length ? "Add another" : "Screenshot"}</button>` : ""}</div>
        ${recUi}
        <div class="live" id="live"></div>
        <input id="ct" placeholder="Title (first sentence of what you say)" maxlength="200" />
        <textarea id="cd" rows="4" placeholder="Details — your transcript lands here"></textarea>
        ${c.note ? `<div class="note">${esc(c.note)}</div>` : ""}
        ${c.error ? `<div class="err">${esc(c.error)}</div>` : ""}
        <div class="row-btns" style="margin-top:0">
          <button class="act" id="csend" ${c.sending || c.capturing ? "disabled" : ""}>${c.sending ? "Sending…" : "Send to Chef"}</button>
          <button class="ghost" id="ccancel">Cancel</button>
        </div>
      </div>`;
    const $ = (sel) => this.$comp.querySelector(sel);
    const ti = $("#ct"), de = $("#cd");
    ti.value = c.title || ""; de.value = c.desc || "";
    ti.oninput = () => { c.title = ti.value; c.titleEdited = true; };
    de.oninput = () => { c.desc = de.value; c.descEdited = true; };
    this.onCmdEnter(de, () => this.sendComposer());
    $("#cx").onclick = $("#ccancel").onclick = () => this.closeComposer();
    $("#csend").onclick = () => this.sendComposer();
    if ($("#addshot")) $("#addshot").onclick = () => this.addScreenshot();
    if ($("#stop")) $("#stop").onclick = () => this.stopRecording();
    if ($("#record")) $("#record").onclick = () => this.startRecording();
    if ($("#rerec")) $("#rerec").onclick = () => this.startRecording();
    if ($("#rmaudio")) $("#rmaudio").onclick = () => { URL.revokeObjectURL(c.audio.url); c.audio = null; this.renderComposer(); };
    this.$comp.querySelectorAll("[data-rm]").forEach((b) => b.onclick = (e) => {
      e.stopPropagation(); const i = +b.dataset.rm; URL.revokeObjectURL(c.shots[i].url); c.shots.splice(i, 1); this.renderComposer();
    });
    this.$comp.querySelectorAll("[data-ann]").forEach((d) => d.onclick = () => this.annotate(+d.dataset.ann));
  }

  // Simple red freehand markup on a screenshot.
  annotate(i) {
    const c = this.c; const shot = c && c.shots[i]; if (!shot) return;
    const img = new Image();
    img.onload = () => {
      const ann = document.createElement("div"); ann.className = "ann";
      ann.innerHTML = `<canvas></canvas><div class="hint">Draw to circle or point at things</div>
        <div class="bar"><button id="undo">Undo</button><button id="clear">Clear</button><button id="acancel">Cancel</button><button class="ok" id="done">Done</button></div>`;
      this.shadowRoot.appendChild(ann); this.$ann = ann;
      const cv = ann.querySelector("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const g = cv.getContext("2d");
      const strokes = []; let cur = null;
      const lw = Math.max(3, Math.round(img.naturalWidth / 300));
      const paint = () => {
        g.drawImage(img, 0, 0);
        g.strokeStyle = "#ef4444"; g.lineWidth = lw; g.lineCap = "round"; g.lineJoin = "round";
        for (const s of strokes) { g.beginPath(); s.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); if (s.length === 1) g.lineTo(s[0][0] + 0.1, s[0][1]); g.stroke(); }
      };
      const pt = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * cv.width, ((e.clientY - r.top) / r.height) * cv.height]; };
      cv.onpointerdown = (e) => { try { cv.setPointerCapture(e.pointerId); } catch {} cur = [pt(e)]; strokes.push(cur); paint(); };
      cv.onpointermove = (e) => { if (cur) { cur.push(pt(e)); paint(); } };
      cv.onpointerup = cv.onpointercancel = () => { cur = null; };
      const close = () => { ann.remove(); this.$ann = null; document.removeEventListener("keydown", onKey, true); };
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
      document.addEventListener("keydown", onKey, true);
      ann.querySelector("#undo").onclick = () => { strokes.pop(); paint(); };
      ann.querySelector("#clear").onclick = () => { strokes.length = 0; paint(); };
      ann.querySelector("#acancel").onclick = close;
      ann.querySelector("#done").onclick = () => {
        if (!strokes.length) return close();
        cv.toBlob((b) => {
          close();
          if (!b || this.c !== c || !c.shots[i]) return;
          URL.revokeObjectURL(c.shots[i].url);
          c.shots[i] = { blob: b, url: URL.createObjectURL(b) };
          this.renderComposer();
        }, "image/png");
      };
      paint();
    };
    img.src = shot.url;
  }

  async upload(blob) {
    const postUrl = await this.client.mutation(this.ref("generateUploadUrl"), {});
    const res = await fetch(postUrl, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
    if (!res.ok) throw new Error(`upload failed (${res.status})`);
    const { storageId } = await res.json();
    return storageId;
  }

  async sendComposer() {
    const c = this.c; if (!c || c.sending) return;
    if (c.recording) await this.stopRecording();
    const transcript = c.transcript.trim();
    const description = (c.desc ?? transcript).trim();
    const title = (c.title || firstSentence(description) || (c.shots.length ? "Screenshot feedback" : "")).trim().slice(0, 200);
    if (!title) { c.error = "Say or type what you'd like Chef to build."; return this.renderComposer(); }
    if (!this.client) { c.error = "Chef isn't connected yet — try again in a moment."; return this.renderComposer(); }
    c.sending = true; c.error = ""; this.renderComposer();
    try {
      const screenshotStorageIds = [];
      for (const s of c.shots) screenshotStorageIds.push(await this.upload(await fitShot(s.blob)));
      const audioStorageId = c.audio ? await this.upload(c.audio.blob) : undefined;
      await this.client.mutation(this.ref("submitRequestWithMedia"), {
        title, description, transcript: transcript || undefined, screenshotStorageIds, audioStorageId,
        context: { screen: (location.pathname + location.search).slice(0, 120) },
      });
      writeDraft(this.draftKey, "");
      this.closeComposer();
    } catch (e) {
      if (this.c !== c) return;
      if (isUnauth(e)) {
        c.error = "Sign in to send requests to Chef.";
      } else if (isMissingFn(e)) {
        // The host hasn't exposed the media functions: still file the request
        // as text so nothing the user said is lost.
        this.mediaOk = false;
        try {
          const desc = [description, transcript && transcript !== description ? `Voice note (transcript): ${transcript}` : ""].filter(Boolean).join("\n\n");
          await this.client.mutation(this.ref("submitRequest"), { title, description: desc });
          this.closeComposer();
          return;
        } catch (e2) { c.error = `Couldn't send: ${isUnauth(e2) ? "sign in first" : errMsg(e2)}`; }
      } else {
        c.error = `Couldn't send: ${errMsg(e)}`;
      }
      c.sending = false; this.renderComposer();
    }
  }
}

function isMissingFn(e) { return /Could not find (public )?function|Could not find module/i.test(String(e && e.message || e)); }
function errMsg(e) {
  const d = e && e.data; if (d && typeof d === "object" && d.message) return d.message;
  return String((e && e.message) || e).replace(/^\[CONVEX[^\]]*\]\s*/, "").replace(/^(\[Request ID: [^\]]*\]\s*)?Server Error\s*/, "").replace(/^Uncaught (Convex)?Error:\s*/, "").split("\n")[0].slice(0, 200);
}
function fmtMs(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function firstSentence(t) {
  t = String(t || "").trim(); if (!t) return "";
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  const s = (m ? m[1] : t.split("\n")[0]).trim();
  return s.length > 120 ? s.slice(0, 117).replace(/\s+\S*$/, "") + "…" : s;
}
let shotLib = null;
// Leave out the panel itself and browser-extension overlays: cloning an
// extension's custom element (e.g. 1Password's) re-runs its constructor and
// injects chrome-extension:// frames into the page.
const EXT_TAG = /^(COM-1PASSWORD|GRAMMARLY|LOOM|DASHLANE|BITWARDEN|LASTPASS|PLASMO|WXT)/;
function shotFilter(n) {
  const t = n && n.tagName;
  if (!t) return true;
  if (t === "CHEF-PANEL" || EXT_TAG.test(t)) return false;
  if (n.hasAttribute && n.hasAttribute("data-chef-panel")) return false;
  if (t === "IFRAME" && /^(chrome|moz|safari-web)-extension:/.test(n.getAttribute("src") || "")) return false;
  return true;
}
// Render the visible viewport to a PNG via a DOM snapshot (no screen-share
// prompt). <chef-panel> itself is filtered out of the clone.
async function capturePage() {
  shotLib = shotLib || import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ SHOT_LIB);
  const { domToCanvas } = await shotLib;
  const body = document.body, rect = body.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const bg = getComputedStyle(body).backgroundColor;
  const full = await domToCanvas(body, {
    scale,
    backgroundColor: bg && bg !== "rgba(0, 0, 0, 0)" ? bg : getComputedStyle(document.documentElement).backgroundColor || "#ffffff",
    filter: shotFilter,
    timeout: 8000,
    autoDestruct: true, // remove modern-screenshot's sandbox iframe afterwards
  });
  // Crop the body render to what is on screen right now.
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = document.createElement("canvas");
  out.width = Math.round(vw * scale); out.height = Math.round(vh * scale);
  const g = out.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, out.width, out.height);
  g.drawImage(full, -rect.left * scale, -rect.top * scale);
  return await new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/png"));
}
// Keep screenshots under the 10 MB cap: re-encode big PNGs as JPEG, shrinking if needed.
async function fitShot(blob) {
  if (blob.size <= MAX_SHOT_BYTES) return blob;
  const bmp = await createImageBitmap(blob);
  for (const k of [1, 0.75, 0.5, 0.35]) {
    const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    const b = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.85));
    if (b && b.size <= MAX_SHOT_BYTES) return b;
  }
  throw new Error("Screenshot is too large");
}
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])); }

function isUnauth(e) {
  const d = e && e.data;
  if (d && typeof d === "object" && d.code === "UNAUTHENTICATED") return true;
  return /not signed in|unauthenticated/i.test(String((e && e.message) || e));
}
function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - Number(ms)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
// A half-typed request survives reloads (per tab). Best effort only.
function readDraft(key) { try { return sessionStorage.getItem(key) || ""; } catch { return ""; } }
function writeDraft(key, v) { try { v ? sessionStorage.setItem(key, v) : sessionStorage.removeItem(key); } catch {} }

/** Register <chef-panel> (idempotent; a no-op outside the browser). */
export function defineChefPanel() {
  if (typeof customElements !== "undefined" && !customElements.get("chef-panel")) {
    customElements.define("chef-panel", ChefPanelElement);
  }
}
defineChefPanel();
