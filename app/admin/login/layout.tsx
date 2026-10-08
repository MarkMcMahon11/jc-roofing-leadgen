import type { Metadata } from "next";
import { cookies } from "next/headers";
import { parseTheme, resolveTheme, SCHEME_COOKIE, THEME_COOKIE } from "@/lib/theme";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = resolveTheme(parseTheme(jar.get(THEME_COOKIE)?.value), jar.get(SCHEME_COOKIE)?.value);
  return <div data-theme={theme}>{children}</div>;
}
