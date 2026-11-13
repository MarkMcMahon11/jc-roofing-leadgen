import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Globe, MapPin, Pencil, Phone, Plus } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { Badge, ButtonLink, Mono, PageHeader } from "@/components/ui/primitives";
import { LinkTabs } from "@/components/ui/url-controls";
import { ActivityTab, ContactsTab, ContractsTab, JobsTab, MoneyTab, OverviewTab, PropertiesTab } from "../_components/org-tabs";
import { ORG_STATUSES, isUuid, orgStatusTone } from "../_lib/shared";

export async function generateMetadata({ params }: PageProps<"/crm/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Client" };
  const supabase = await createClient();
  const { data } = await supabase.from("organisations").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Client" };
}

export default async function OrganisationPage({ params, searchParams }: PageProps<"/crm/[id]">) {
  const ctx = await requireInternal("crm.read");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organisations")
    .select(
      "id, reference, name, category, status, company_number, vat_number, website, email, phone, address_line1, address_line2, town, postcode, payment_terms_days, credit_limit, portal_enabled, tags, notes, created_at, account_manager:profiles!organisations_account_manager_id_fkey(full_name, email), contract_manager:profiles!organisations_contract_manager_id_fkey(full_name, email)",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();

  const can = {
    contracts: ctx.can("contracts.read"),
    properties: ctx.can("properties.read"),
    jobs: ctx.can("work_orders.read"),
    money: ctx.can("quotes.read") || ctx.can("finance.read"),
  };
  const head = { count: "exact" as const, head: true };
  const [lookups, contacts, contracts, properties, jobs, activity] = await Promise.all([
    getLookups(ctx.tenantId),
    supabase.from("contacts").select("id", head).eq("tenant_id", ctx.tenantId).eq("organisation_id", id).is("archived_at", null),
    can.contracts ? supabase.from("contracts").select("id", head).eq("tenant_id", ctx.tenantId).eq("organisation_id", id) : Promise.resolve({ count: 0 }),
    can.properties ? supabase.from("properties").select("id", head).eq("tenant_id", ctx.tenantId).eq("organisation_id", id).is("archived_at", null) : Promise.resolve({ count: 0 }),
    can.jobs ? supabase.from("work_orders").select("id", head).eq("tenant_id", ctx.tenantId).eq("organisation_id", id) : Promise.resolve({ count: 0 }),
    supabase.from("crm_activities").select("id", head).eq("tenant_id", ctx.tenantId).eq("organisation_id", id),
  ]);

  const base = `/crm/${id}`;
  const tabs = [
    { key: "overview", label: "Overview", href: base },
    { key: "contacts", label: "Contacts", href: `${base}?tab=contacts`, count: contacts.count ?? 0 },
    can.contracts && { key: "contracts", label: "Contracts", href: `${base}?tab=contracts`, count: contracts.count ?? 0 },
    can.properties && { key: "properties", label: "Properties", href: `${base}?tab=properties`, count: properties.count ?? 0 },
    can.jobs && { key: "jobs", label: "Jobs", href: `${base}?tab=jobs`, count: jobs.count ?? 0 },
    can.money && { key: "money", label: "Quotes & invoices", href: `${base}?tab=money` },
    { key: "activity", label: "Activity", href: `${base}?tab=activity`, count: activity.count ?? 0 },
  ].filter((t): t is { key: string; label: string; href: string; count?: number } => Boolean(t));
  const tab = tabs.some((t) => t.key === sp.tab) ? (sp.tab as string) : "overview";
  const place = [org.town, org.postcode].filter(Boolean).join(" ");

  return (
    <>
      <Link href="/crm" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ChevronLeft className="size-3.5" aria-hidden />
        Clients & CRM
      </Link>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-2">
            <Mono className="text-xs">{org.reference}</Mono>
            <span aria-hidden>·</span>
            {lookups.label("organisation_category", org.category)}
          </span>
        }
        title={org.name}
        actions={
          <>
            {ctx.can("work_orders.write") && org.status !== "inactive" && (
              <ButtonLink href={`/jobs/new?org=${org.id}`} variant="ghost">
                <Plus className="size-4" aria-hidden />
                New job
              </ButtonLink>
            )}
            {ctx.can("contracts.write") && (
              <ButtonLink href={`/contracts/new?org=${org.id}`} variant="secondary">
                <Plus className="size-4" aria-hidden />
                New contract
              </ButtonLink>
            )}
            {ctx.can("crm.write") && (
              <ButtonLink href={`/crm/${org.id}/edit`} variant="secondary">
                <Pencil className="size-4" aria-hidden />
                Edit
              </ButtonLink>
            )}
          </>
        }
      >
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted">
          <Badge tone={orgStatusTone[org.status] ?? "neutral"} dot>
            {ORG_STATUSES.find((s) => s.value === org.status)?.label ?? org.status}
          </Badge>
          {place && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5 text-subtle" aria-hidden />
              {place}
            </span>
          )}
          {org.phone && (
            <a href={`tel:${org.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-fg">
              <Phone className="size-3.5 text-subtle" aria-hidden />
              {org.phone}
            </a>
          )}
          {org.website && (
            <a href={/^https?:\/\//i.test(org.website) ? org.website : `https://${org.website}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-fg">
              <Globe className="size-3.5 text-subtle" aria-hidden />
              {org.website.replace(/^https?:\/\//i, "")}
            </a>
          )}
        </div>
      </PageHeader>

      <div className="mb-6">
        <LinkTabs tabs={tabs} current={tab} />
      </div>

      {tab === "overview" && <OverviewTab ctx={ctx} org={{ ...org, credit_limit: org.credit_limit === null ? null : Number(org.credit_limit) }} />}
      {tab === "contacts" && <ContactsTab ctx={ctx} orgId={org.id} />}
      {tab === "contracts" && <ContractsTab ctx={ctx} orgId={org.id} />}
      {tab === "properties" && <PropertiesTab ctx={ctx} orgId={org.id} />}
      {tab === "jobs" && <JobsTab ctx={ctx} orgId={org.id} />}
      {tab === "money" && <MoneyTab ctx={ctx} orgId={org.id} />}
      {tab === "activity" && <ActivityTab ctx={ctx} orgId={org.id} />}
    </>
  );
}
