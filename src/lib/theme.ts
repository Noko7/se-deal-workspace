export const THEME_COOKIE = "app-theme";

export type Theme = "light" | "dark";

export function resolveTheme(value: string | undefined | null): Theme {
  return value === "dark" ? "dark" : "light";
}
