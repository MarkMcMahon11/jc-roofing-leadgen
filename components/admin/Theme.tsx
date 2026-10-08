"use client";

import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { SCHEME_COOKIE, THEME_COOKIE, type Theme } from "@/lib/theme";

const query = "(prefers-color-scheme: dark)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(query);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

const setCookie = (name: string, value: string) => {
  try {
    document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  } catch {
    // cookies blocked: the choice just won't be remembered
  }
};

/** Theme state for the shell: `resolved` is what is actually drawn. */
export function useTheme(initial: Theme, initialDark: boolean) {
  const [theme, setTheme] = useState<Theme>(initial);
  const systemDark = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => initialDark);
  const resolved: "light" | "dark" = theme === "auto" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    setCookie(SCHEME_COOKIE, resolved);
    const html = document.documentElement;
    html.style.colorScheme = resolved;
    // the bounce area behind the page matches too
    const bg = resolved === "dark" ? "#0b0f16" : "";
    html.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    return () => {
      html.style.colorScheme = "";
      html.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
    };
  }, [resolved]);

  const choose = useCallback((t: Theme) => {
    setTheme(t);
    setCookie(THEME_COOKIE, t);
  }, []);
  return { theme, resolved, choose };
}

/** Header button: flips between light and dark. */
export function ThemeToggle({ resolved, onChoose }: { resolved: "light" | "dark"; onChoose: (t: Theme) => void }) {
  const dark = resolved === "dark";
  return (
    <button
      type="button"
      onClick={() => onChoose(dark ? "light" : "dark")}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="btn-silver inline-flex h-10 w-10 items-center justify-center rounded-lg border-[1.5px] border-ctrl text-night"
    >
      {dark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
      <span className="sr-only">{dark ? "Switch to light mode" : "Switch to dark mode"}</span>
    </button>
  );
}
