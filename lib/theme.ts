// Light / dark for the owner dashboard. "auto" follows the device. The choice lives in a cookie so the server draws the
// right colours on the first paint (no white flash for someone who picked dark).

export type Theme = "light" | "dark" | "auto";
export const THEME_COOKIE = "jc_theme";
export const SCHEME_COOKIE = "jc_scheme"; // what "auto" last resolved to on this device

export const parseTheme = (v: string | undefined): Theme => (v === "light" || v === "dark" || v === "auto" ? v : "auto");

/** What to draw on the server: an explicit choice wins; "auto" uses what this device last reported. */
export const resolveTheme = (theme: Theme, scheme: string | undefined): "light" | "dark" => (theme === "auto" ? (scheme === "dark" ? "dark" : "light") : theme);
