import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, EmptyState, Table, TD, TH, THead, TR, type Tone } from "@/components/ui/primitives";
import { FilterSelect, Pagination, SearchBox } from "@/components/ui/url-controls";
import { dateTime, label } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };
const PAGE = 50;
const tone: Record<string, Tone> = { insert: "ok", update: "info", delete: "bad", login: "accent", logout: "neutral", approve: "ok", reject: "warn", ai_action: "accent", retention: "warn", system: "neutral", export: "warn" };

export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  const ctx = await requireInternal("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const supabase = await createClient();
  let q = supabase.from("audit_logs").select("id, created_at, actor_email, action, entity, entity_id, summary, changes", { count: "exact" }).eq("tenant_id", ctx.tenantId);
  if (typeof sp.action === "string") q = q.eq("action", sp.action);
  if (typeof sp.entity === "string") q = q.eq("entity", sp.entity);
  if (typeof sp.q === "string") q = q.or(`actor_email.ilike.%${sp.q.replace(/[%,()]/g, "")}%,summary.ilike.%${sp.q.replace(/[%,()]/g, "")}%`);
  const { data, count } = await q.order("id", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);

  return (
    <Card>
      <CardHeader title="Audit log" description="Every change to business records, sign-ins and approvals. Personal data values are redacted; the fact of the change is kept." />
      <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
        <SearchBox placeholder="Search person or record…" className="w-72" />
        <FilterSelect param="action" label="Action" options={["insert", "update", "delete", "login", "logout", "approve", "ai_action", "retention", "system"].map((a) => ({ value: a, label: label(a) }))} />
        <FilterSelect param="entity" label="Record" options={["work_orders", "organisations", "contracts", "properties", "occupants", "memberships", "role_permissions", "invoices", "employees", "quotations", "job_assignments"].map((a) => ({ value: a, label: label(a) }))} />
      </div>
      {data?.length ? (
        <Table>
          <THead><tr><TH>When</TH><TH>Who</TH><TH>Action</TH><TH>Record</TH><TH>Change</TH></tr></THead>
          <tbody>
            {data.map((a) => (
              <TR key={a.id}>
                <TD className="whitespace-nowrap text-muted">{dateTime(a.created_at)}</TD>
                <TD className="text-[13px]">{a.actor_email ?? <span className="text-subtle">System</span>}</TD>
                <TD><Badge tone={tone[a.action] ?? "neutral"}>{a.action}</Badge></TD>
                <TD><div className="text-[13px]">{label(a.entity)}</div><div className="max-w-48 truncate text-xs text-subtle">{a.summary}</div></TD>
                <TD className="max-w-md"><ChangeSummary action={a.action} changes={a.changes as Record<string, unknown> | null} /></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No audit entries match" />
      )}
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} />
    </Card>
  );
}

function ChangeSummary({ action, changes }: { action: string; changes: Record<string, unknown> | null }) {
  if (!changes) return <span className="text-subtle">-</span>;
  if (action !== "update") return <span className="text-xs text-subtle">{Object.keys(changes).length} fields</span>;
  return (
    <ul className="space-y-0.5 text-xs">
      {Object.entries(changes).slice(0, 4).map(([k, v]) => {
        const c = v as { from?: unknown; to?: unknown; changed?: boolean };
        return (
          <li key={k} className="truncate">
            <span className="text-subtle">{label(k)}:</span>{" "}
            {c.changed ? <span className="text-warn">changed (personal data, value hidden)</span> : <><span className="text-muted line-through">{fmt(c.from)}</span> → <span className="text-fg">{fmt(c.to)}</span></>}
          </li>
        );
      })}
    </ul>
  );
}
function fmt(v: unknown) {
  if (v === null || v === undefined) return "empty";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 40 ? s.slice(0, 40) + "…" : s;
}
