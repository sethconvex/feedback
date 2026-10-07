"use client";
/**
 * ChefPanelMount — one line to put the `<chef-panel>` web component (the
 * floating Chef bubble: requests with screenshots + voice notes, build status,
 * Chef's questions, and approvals for admins) on every page of a React app.
 *
 *   // inside your ConvexProvider / client providers component
 *   import { ChefPanelMount } from "@convex-dev/feedback/react";
 *   import { useAuthToken } from "@convex-dev/auth/react";
 *
 *   <ChefPanelMount convexUrl={process.env.NEXT_PUBLIC_CONVEX_URL!} token={useAuthToken()} />
 *
 * The panel talks to the functions `exposeChefApi` creates in `convex/<prefix>.ts`
 * (default "chef"). It runs its own Convex client; this component loads the
 * script once, appends one `<chef-panel>` to `document.body`, and keeps its auth
 * in sync with your app's (pass `token`, or `getToken` for providers like Clerk:
 * `getToken={() => getToken({ template: "convex" })}`). Renders nothing itself.
 *
 * The panel element is intentionally kept across unmounts/hot reloads so a
 * half-typed request survives; drafts also survive full reloads (sessionStorage).
 */
import { useEffect, useRef } from "react";
import type { ChefAuthTokenFetcher, ChefPanelElement } from "../../panel/chef-panel.browser.js";

export type ChefPanelMountProps = {
  /** Your deployment URL, e.g. process.env.NEXT_PUBLIC_CONVEX_URL. */
  convexUrl: string | undefined;
  /** Module name of your `exposeChefApi` exports (convex/chef.ts → "chef"). */
  prefix?: string;
  /** The signed-in user's Convex auth token (e.g. `useAuthToken()`); null/undefined = signed out. */
  token?: string | null;
  /** Alternative to `token`: a fetcher like ConvexClient.setAuth takes. */
  getToken?: ChefAuthTokenFetcher | (() => Promise<string | null | undefined>);
  /**
   * Load the panel from a URL instead of from this package (e.g. a copy you
   * serve yourself, with a content hash for cache busting).
   */
  src?: string;
  /** Start expanded. */
  defaultOpen?: boolean;
};

let loaded: Promise<unknown> | null = null;
function loadPanel(src?: string): Promise<unknown> {
  if (loaded) return loaded;
  if (src) {
    loaded = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.type = "module";
      s.src = src;
      s.setAttribute("data-chef-panel", "1");
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`chef-panel: failed to load ${src}`));
      document.head.appendChild(s);
    });
  } else {
    loaded = import("../../panel/chef-panel.browser.js");
  }
  return loaded;
}

export function ChefPanelMount({ convexUrl, prefix = "chef", token, getToken, src, defaultOpen }: ChefPanelMountProps) {
  // Read through refs so the panel's fetcher always sees the latest auth.
  const auth = useRef({ token, getToken });
  auth.current = { token, getToken };
  const usesFetcher = getToken !== undefined;

  // Mount (once per URL/prefix): load the script and add the element.
  useEffect(() => {
    if (!convexUrl) return;
    void loadPanel(src).catch((e) => console.error(e));
    let el = document.querySelector<ChefPanelElement>(`chef-panel[prefix="${prefix}"]`);
    if (!el || el.getAttribute("convex-url") !== convexUrl) {
      el?.remove();
      el = document.createElement("chef-panel") as ChefPanelElement;
      el.setAttribute("convex-url", convexUrl);
      el.setAttribute("prefix", prefix);
      if (defaultOpen) el.setAttribute("open", "1");
      document.body.appendChild(el);
    }
  }, [convexUrl, prefix, src, defaultOpen]);

  // Hand the panel our auth; re-hand it whenever the token changes so the
  // panel's client re-authenticates (sign-in, sign-out, refresh).
  useEffect(() => {
    if (!convexUrl) return;
    let cancelled = false;
    void customElements.whenDefined("chef-panel").then(() => {
      const el = document.querySelector<ChefPanelElement>(`chef-panel[prefix="${prefix}"]`);
      if (cancelled || !el?.setAuth) return;
      el.setAuth(async (args) => {
        const a = auth.current;
        if (a.getToken) return (await a.getToken(args)) ?? null;
        return a.token ?? null;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [convexUrl, prefix, usesFetcher ? "fetcher" : token]);

  return null;
}
