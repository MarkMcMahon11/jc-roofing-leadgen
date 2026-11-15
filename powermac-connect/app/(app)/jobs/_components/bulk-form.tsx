"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, FileText, ListChecks, Loader2, XCircle } from "lucide-react";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { Card, CardBody, CardHeader, cx, Input, Mono, Notice } from "@/components/ui/primitives";
import { bulkCreateJobs, loadClientOptions, type BulkResult } from "../actions";
import { PRIORITIES } from "../_lib/constants";
import type { ContractOption, Option, PropertyOption } from "../_lib/types";

const hours = (h: number | null) => (h === null ? "-" : h % 24 === 0 && h >= 48 ? `${h / 24} days` : `${h} h`);

export function BulkForm({ clients, categories, trades, statuses }: { clients: Option[]; categories: Option[]; trades: Option[]; statuses: Option[] }) {
  const [org, setOrg] = useState("");
  const [data, setData] = useState<{ properties: PropertyOption[]; contracts: ContractOption[] }>({ properties: [], contracts: [] });
  const [contract, setContract] = useState("");
  const [priority, setPriority] = useState("planned");
  const [mode, setMode] = useState<"select" | "csv">("select");
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, start] = useTransition();
  const [formKey, setFormKey] = useState(0);

  const chooseOrg = (id: string) => {
    setOrg(id);
    setContract("");
    setPicked(new Set());
    setFilter("");
    if (!id) return setData({ properties: [], contracts: [] });
    start(async () => {
      const next = await loadClientOptions(id);
      setData(next);
      const active = next.contracts.filter((c) => c.status === "active");
      if (active.length === 1) setContract(active[0].id);
    });
  };

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? data.properties.filter((p) => `${p.reference} ${p.address} ${p.postcode} ${p.town}`.toLowerCase().includes(q)) : data.properties;
  }, [data.properties, filter]);
  const allVisiblePicked = visible.length > 0 && visible.every((p) => picked.has(p.id));
  const toggleAll = () => {
    const next = new Set(picked);
    if (allVisiblePicked) visible.forEach((p) => next.delete(p.id));
    else visible.forEach((p) => next.add(p.id));
    setPicked(next);
  };
  const sla = data.contracts.find((c) => c.id === contract)?.slas.find((s) => s.priority === priority);

  return (
    <ActionForm<BulkResult> key={formKey} action={bulkCreateJobs} className="grid gap-6">
      {(state) => (
        <>
          {state.ok && state.created && (
            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-ok" aria-hidden /> {state.created.length} job{state.created.length === 1 ? "" : "s"} created
                  </span>
                }
                description="Each job starts in the status you chose and follows the normal workflow."
                actions={
                  <button
                    type="button"
                    className="text-sm font-medium text-accent-hi hover:underline"
                    onClick={() => {
                      setPicked(new Set());
                      setFormKey((k) => k + 1);
                    }}
                  >
                    Start another batch
                  </button>
                }
              />
              <ul className="max-h-80 divide-y divide-line overflow-y-auto" data-testid="bulk-created">
                {state.created.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-5 py-2.5 text-sm">
                    <Link href={`/jobs/${c.id}`} className="hover:underline">
                      <Mono>{c.reference}</Mono>
                    </Link>
                    <span className="text-fg">{c.title}</span>
                    <span className="text-xs text-subtle">{c.address}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {state.unmatched && state.unmatched.length > 0 && (
            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <XCircle className="size-4 text-bad" aria-hidden /> {state.unmatched.length} line{state.unmatched.length === 1 ? "" : "s"} not matched
                  </span>
                }
                description="No job was created for these lines. Fix them and paste them again."
              />
              <ul className="divide-y divide-line" data-testid="bulk-unmatched">
                {state.unmatched.map((u) => (
                  <li key={u.line} className="grid gap-0.5 px-5 py-2.5 text-sm md:grid-cols-[80px_1fr_1fr]">
                    <span className="text-xs text-subtle tabular">Line {u.line}</span>
                    <code className="truncate font-mono text-[12.5px] text-muted">{u.text}</code>
                    <span className="text-[#ffb3b1]">{u.reason}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="1. Client, contract and defaults" description="Every job in this batch gets these values." actions={loading ? <Loader2 className="size-4 animate-spin text-accent-hi" aria-label="Loading" /> : null} />
            <CardBody className="grid gap-4 md:grid-cols-3">
              <SelectField name="organisation_id" label="Client" required options={clients} placeholder="Choose a client…" value={org} onChange={(e) => chooseOrg(e.target.value)} />
              <SelectField
                name="contract_id"
                label="Contract"
                options={data.contracts.map((c) => ({ value: c.id, label: c.label }))}
                placeholder={org ? "No contract" : "Choose a client first"}
                value={contract}
                disabled={!org}
                onChange={(e) => setContract(e.target.value)}
                hint={contract ? (sla ? `SLA: attend within ${hours(sla.attend_hours)}, complete within ${hours(sla.complete_hours)} from now.` : "No SLA for this priority: targets left blank.") : undefined}
              />
              <SelectField name="priority" label="Priority" required options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} value={priority} onChange={(e) => setPriority(e.target.value)} />
              <SelectField name="work_category" label="Work category" required options={categories} placeholder="Choose a category…" />
              <SelectField name="trade" label="Trade" required options={trades} placeholder="Choose a trade…" />
              <SelectField name="status" label="Starting status" required options={statuses} defaultValue={statuses[0]?.value} />
              <TextField
                name="title_template"
                label="Job title"
                required
                maxLength={200}
                className="md:col-span-2"
                placeholder="e.g. Annual gutter clearance - {address}"
                hint="Use {address}, {postcode}, {town} or {reference} to fill in each property's details."
              />
              <TextField name="estimated_hours" label="Estimated hours (each)" type="number" min={0} step={0.25} inputMode="decimal" />
              <TextAreaField name="description" label="Description" rows={3} className="md:col-span-3" maxLength={20000} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="2. Properties" description="Pick properties from the list, or paste lines from a spreadsheet." />
            <div className="flex gap-1 border-b border-line px-5" role="tablist" aria-label="How to choose properties">
              {(
                [
                  ["select", "Pick from list", ListChecks],
                  ["csv", "Paste CSV", FileText],
                ] as const
              ).map(([key, text, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={mode === key}
                  onClick={() => setMode(key)}
                  className={cx(
                    "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm",
                    mode === key ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg",
                  )}
                >
                  <Icon className="size-4" aria-hidden /> {text}
                </button>
              ))}
            </div>
            <input type="hidden" name="mode" value={mode} />
            {mode === "select" ? (
              <CardBody>
                {!org ? (
                  <p className="py-6 text-center text-sm text-muted">Choose a client to list its properties.</p>
                ) : data.properties.length === 0 && !loading ? (
                  <p className="py-6 text-center text-sm text-muted">This client has no properties yet.</p>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <Input type="search" placeholder="Search address, postcode or reference…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm" aria-label="Search properties" />
                      <label className="flex items-center gap-2 text-sm text-muted">
                        <input type="checkbox" className="size-4 accent-[#5ee000]" checked={allVisiblePicked} onChange={toggleAll} />
                        Select all{filter ? " shown" : ""} ({visible.length})
                      </label>
                      <span className="ml-auto text-sm text-fg tabular" aria-live="polite">
                        {picked.size} selected
                      </span>
                    </div>
                    <ul className="max-h-[420px] divide-y divide-line overflow-y-auto rounded-xl border border-line" aria-label="Properties">
                      {visible.map((p) => (
                        <li key={p.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-raised/50">
                            <input
                              type="checkbox"
                              name="property_id"
                              value={p.id}
                              className="size-4 shrink-0 accent-[#5ee000]"
                              checked={picked.has(p.id)}
                              onChange={(e) => {
                                const next = new Set(picked);
                                if (e.target.checked) next.add(p.id);
                                else next.delete(p.id);
                                setPicked(next);
                              }}
                            />
                            <span className="min-w-0 flex-1 truncate text-fg">{p.address}</span>
                            <span className="hidden text-xs text-subtle sm:inline">
                              {p.town} {p.postcode}
                            </span>
                            <Mono className="text-[11.5px]">{p.reference}</Mono>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {/* picked properties hidden by the search still go with the form */}
                    {[...picked]
                      .filter((id) => !visible.some((p) => p.id === id))
                      .map((id) => (
                        <input key={id} type="hidden" name="property_id" value={id} />
                      ))}
                  </>
                )}
              </CardBody>
            ) : (
              <CardBody className="grid gap-3">
                <Notice tone="neutral">
                  One job per line: <code className="font-mono text-fg">property reference or postcode, title, description</code>. Title and description are optional (the defaults above are used).
                  Properties are matched within the chosen client; postcodes shared by several properties need the reference instead.
                </Notice>
                <TextAreaField
                  name="csv"
                  label="Lines"
                  rows={8}
                  className="font-mono"
                  placeholder={"PM-PRP-00012, Gutter clearance, Clear and flush all gutters\nG15 6TT, Smoke alarm test\nPM-PRP-00031"}
                />
              </CardBody>
            )}
          </Card>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-sm text-muted">{mode === "select" ? `${picked.size} job${picked.size === 1 ? "" : "s"} will be created` : "One job per matched line"}</span>
            <SubmitButton pendingLabel="Creating jobs…">Create jobs</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
