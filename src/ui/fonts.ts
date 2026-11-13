/**
 * Display font — "Creepster" (Font Diner, SIL OFL 1.1), self-hosted from
 * src/assets/fonts via the @font-face rule in style.css. No CDN, no network.
 */

/** Title / call-out stack: bundled Creepster, then system fallbacks. */
export const TITLE_FONT_FAMILY =
  "'Creepster', 'Chalkboard SE', 'Comic Sans MS', 'Arial Rounded MT Bold', fantasy"

/**
 * Asks the browser to load the bundled font file now (canvas text does not
 * trigger a lazy load). Resolves either way: on timeout or failure the system
 * fallbacks are used.
 */
export async function loadTitleFont(timeoutMs = 1500): Promise<void> {
  try {
    if (typeof document === 'undefined' || !document.fonts) return
    await Promise.race([
      document.fonts.load("48px 'Creepster'"),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ])
  } catch { /* fall back to system fonts */ }
}
