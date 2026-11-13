import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, ChevronLeft } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, EmptyState, Stat, Table, TD, TH, THead, TR, cx } from "@/components/ui/primitives";
import { LinkTabs, Pagination } from "@/components/ui/url-controls";
import { dateTime, relative, todayISO } from "@/lib/format";
import { ActionButton } from "../_components/action-button";
import { setActivityDone } from "../actions";
import { activityLabel, fullName, isoDaysFromNow, londonToISO, pageNo } from "../_lib/shared";

export const metadata: Metadata = { title: "Follow-ups" };
const PAGE = 50;

export default async function FollowUpsPage({ searchParams }: PageProps<"/crm/follow-ups">) {
  const ctx = await requireInternal("crm.read");
  const sp = await searchParams;
  const everyone = sp.who === "all" && ctx.can("crm.write");
  const page = pageNo(sp.page);
  const now = new Date().toISOString();
  const endOfToday = londonToISO(`${todayISO()}T23:59`)!;
  const supabase = await createClient();

  const base = () => {
    const q = supabase.from("crm_activities").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).is("completed_at", null).not("due_at", "is", null);
    return everyone ? q : q.eq("owner_id", ctx.userId);
  };
  let list = supabase
    .from("crm_activities")
    .select(
      "id, type, subject, body, due_at, organisation_id, org:organisations(name), contact:contacts(first_name, last_name, phone, email), owner:profiles!crm_activities_owner_id_fkey(full_name)",
      { count: "exact" },
    )
    .eq("tenant_id", ctx.tenantId)
    .is("completed_at", null)
    .not("due_at", "is", null);
  if (!everyone) list = list.eq("owner_id", ctx.userId);
  const [{ data, count: total }, overdue, today, week] = await Promise.all([
    list.order("due_at").range((page - 1) * PAGE, page * PAGE - 1),
    base().lt("due_at", now),
    base().gte("due_at", now).lte("due_at", endOfToday),
    base().gt("due_at", endOfToday).lte("due_at", isoDaysFromNow(7)),
  ]);
  const canWrite = ctx.can("crm.write");

  return (
    <>
      <Link href="/crm" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ChevronLeft className="size-3.5" aria-hidden />
        Clients & CRM
      </Link>
      <div className="mb-6 flex flex-col gap-1">
        <p className="text-xs font-medium tracking-[0.14em] text-accent-hi uppercase">Clients</p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{everyone ? "Team follow-ups & reminders" : "My follow-ups & reminders"}</h1>
        <p className="max-w-2xl text-sm text-muted">Calls to return, proposals to chase and tasks with a due date. Log new ones from a client&apos;s Activity tab.</p>
      </div>
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Overdue" value={overdue.count ?? 0} tone={overdue.count ? "bad" : "ok"} />
        <Stat label="Due today" value={today.count ?? 0} tone={today.count ? "warn" : "neutral"} />
        <Stat label="Next 7 days" value={week.count ?? 0} tone="info" />
      </div>
      <Card>
        {canWrite && (
          <div className="px-5 pt-1">
            <LinkTabs
              current={everyone ? "all" : "mine"}
              tabs={[
                { key: "mine", label: "Mine", href: "/crm/follow-ups" },
                { key: "all", label: "Everyone", href: "/crm/follow-ups?who=all" },
              ]}
            />
          </div>
        )}
        {!canWrite && <CardHeader title="Assigned to you" />}
        {data?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Due</TH>
                <TH>Follow-up</TH>
                <TH>Client</TH>
                <TH>Contact</TH>
                {everyone && <TH>Owner</TH>}
                {canWrite && <TH align="right">Action</TH>}
              </tr>
            </THead>
            <tbody>
              {data.map((a) => {
                const late = a.due_at! < now;
                const isToday = !late && a.due_at! <= endOfToday;
                return (
                  <TR key={a.id} className={cx(late && "bg-bad-lo/25")}>
                    <TD className="whitespace-nowrap">
                      <div className={cx("text-[13px] font-medium", late ? "text-[#ff8a87]" : isToday ? "text-[#ffc56b]" : "text-fg")}>{dateTime(a.due_at)}</div>
                      <div className="text-xs text-subtle">{late ? `Overdue · ${relative(a.due_at)}` : relative(a.due_at)}</div>
                    </TD>
                    <TD className="max-w-md">
                      <div className="flex items-center gap-2">
                        <Badge tone={late ? "bad" : isToday ? "warn" : "neutral"}>{activityLabel(a.type)}</Badge>
                        <span className="font-medium">{a.subject}</span>
                      </div>
                      {a.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{a.body}</p>}
                    </TD>
                    <TD>
                      <Link href={`/crm/${a.organisation_id}?tab=activity`} className="text-[13px] hover:text-accent-hi">
                        {a.org?.name ?? "-"}
                      </Link>
                    </TD>
                    <TD className="text-[13px]">
                      {a.contact ? (
                        <>
                          <div>{fullName(a.contact)}</div>
                          {(a.contact.phone || a.contact.email) && (
                            <a href={a.contact.phone ? `tel:${a.contact.phone.replace(/\s/g, "")}` : `mailto:${a.contact.email}`} className="text-xs text-accent-hi hover:underline">
                              {a.contact.phone || a.contact.email}
                            </a>
                          )}
                        </>
                      ) : (
                        <span className="text-subtle">-</span>
                      )}
                    </TD>
                    {everyone && <TD className="text-[13px]">{a.owner?.full_name ?? <span className="text-subtle">Unassigned</span>}</TD>}
                    {canWrite && (
                      <TD align="right">
                        <ActionButton action={setActivityDone.bind(null, a.id, true)}>
                          <CalendarCheck className="size-3.5" aria-hidden />
                          Done
                        </ActionButton>
                      </TD>
                    )}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<CalendarCheck className="size-8" />} title="You're all caught up">
            {everyone ? "No open follow-ups across the team." : "No open follow-ups assigned to you."}
          </EmptyState>
        )}
        <Pagination page={page} pageSize={PAGE} total={total ?? 0} />
      </Card>
    </>
  );
}
