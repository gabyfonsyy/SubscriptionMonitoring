"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_COOKIE, themeAttr, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Holds the theme choice. Applying it is immediate (html[data-theme]) and persisted in a cookie so the
 * server renders the right theme on the next request, with no flash. "system" removes the attribute.
 */
/** How long the dissolve takes. Matches --theme-fade in globals.css. */
const FADE_MS = 900;

export function useTheme(initial: Theme): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(initial);
  const setTheme = (t: Theme) => {
    if (t === theme) return;
    const root = document.documentElement;
    const attr = themeAttr(t);
    const apply = () => {
      setThemeState(t);
      if (attr) root.setAttribute("data-theme", attr);
      else root.removeAttribute("data-theme");
    };
    // One year; Lax; readable by the server on every request.
    document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=31536000; samesite=lax`;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    if (typeof document.startViewTransition === "function") {
      // The browser snapshots the old page, switches theme underneath, then slowly dissolves one into the
      // other. Everything is included (charts, shadows, menus), and nothing animates piecemeal.
      document.startViewTransition(() => flushSync(apply));
      return;
    }
    // Fallback: let every colour property ease over the same duration.
    root.classList.add("theme-fade");
    apply();
    window.setTimeout(() => root.classList.remove("theme-fade"), FADE_MS + 100);
  };
  return [theme, setTheme];
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Three-way Light / Dark / System switch. */
export function ThemeToggle({ value, onChange, className }: { value: Theme; onChange: (t: Theme) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn("inline-flex rounded-md border border-border-strong bg-surface-2 p-0.5", className)}>
      {OPTIONS.map(({ value: v, label, icon: Icon }) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors",
              on ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className={on ? "" : "sr-only sm:not-sr-only"}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Self-contained version for pages without the app shell (sign-in). */
export function ThemeSwitch({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useTheme(initial);
  return <ThemeToggle value={theme} onChange={setTheme} />;
}
