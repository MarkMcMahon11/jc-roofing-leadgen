import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Picklists } from "./picklists";

export const metadata: Metadata = { title: "Picklists" };

export default async function PicklistsPage({ searchParams }: PageProps<"/settings/picklists">) {
  const ctx = await requireInternal("settings.manage");
  const list = String((await searchParams).list ?? "trade");
  const supabase = await createClient();
  const { data } = await supabase.from("lookup_values").select("id, list, key, label, is_active").eq("tenant_id", ctx.tenantId).order("sort_order").order("label");
  return <Picklists current={list} values={data ?? []} />;
}
