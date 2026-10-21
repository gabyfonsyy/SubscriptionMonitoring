export type Theme = "light" | "dark" | "system";

export const THEME_COOKIE = "theme";

/** Anything that is not an explicit light/dark choice means "follow the system". */
export function parseTheme(value: string | undefined | null): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/** The html attribute for a theme. "system" has none, so the OS preference applies. */
export function themeAttr(theme: Theme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}
