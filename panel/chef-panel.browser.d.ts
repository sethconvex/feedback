// Types for chef-panel.browser.js (the <chef-panel> web component).

/** Same signature as ConvexClient.setAuth's fetcher. */
export type ChefAuthTokenFetcher = (args: { forceRefreshToken: boolean }) => Promise<string | null | undefined>;

/**
 * `<chef-panel convex-url="…" prefix="chef">` — attributes:
 *   - `convex-url` (required): your deployment URL
 *   - `prefix`: the Convex module exposing `exposeChefApi` (default "chef")
 *   - `open="1"`: start expanded
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
