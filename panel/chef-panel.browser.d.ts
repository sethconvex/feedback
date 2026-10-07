// Types for chef-panel.browser.js (the <chef-panel> web component).

/** Same signature as ConvexClient.setAuth's fetcher. */
export type ChefAuthTokenFetcher = (args: { forceRefreshToken: boolean }) => Promise<string | null | undefined>;

/**
 * `<chef-panel convex-url="…" prefix="chef">` — attributes:
 *   - `convex-url` (required): your deployment URL
 *   - `prefix`: the Convex module exposing `exposeChefApi` (default "chef")
 *   - `member-label`: the launcher's text for non-admins (default "Suggest a feature")
 *   - `open="1"`: start expanded
 *   - `offset-bottom` / `offset-right` (px): lift the launcher clear of your own controls
 *   - `whats-new="off"`: don't pop up the "What's new" card (changelogs from `<prefix>:whatsNew`)
 *
 * Admins (server `amAdmin`) see Chef: branding, build status, questions, approvals.
 * Everyone else sees a neutral lightbulb launcher with "Request a feature" + their own requests.
 */
export declare class ChefPanelElement extends HTMLElement {
  /** Authenticate the panel's calls as the signed-in user. Safe to call any time. */
  setAuth(fetchToken: ChefAuthTokenFetcher): void;
  /** Drop auth (signed out). */
  clearAuth(): void;
}

/** Registers `<chef-panel>` (idempotent). Importing the module already does this. */
export declare function defineChefPanel(): void;

declare global {
  interface HTMLElementTagNameMap {
    "chef-panel": ChefPanelElement;
  }
}
