import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/admin/Shell";
import { OpsProvider } from "@/lib/ops/store";
import { ownerSession } from "@/lib/server/auth";
import { metaOf } from "@/lib/server/background";
import { parseTheme, resolveTheme, SCHEME_COOKIE, THEME_COOKIE } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Real check (the proxy in front is only an optimistic gate)
  const session = await ownerSession();
  if (!session) redirect("/admin/login");

  const background = await metaOf();
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const dark = jar.get(SCHEME_COOKIE)?.value === "dark";
  return (
    <OpsProvider theme={resolveTheme(theme, jar.get(SCHEME_COOKIE)?.value)}>
      <Shell ownerName={session.name} background={background} theme={theme} systemDark={dark}>{children}</Shell>
    </OpsProvider>
  );
}
