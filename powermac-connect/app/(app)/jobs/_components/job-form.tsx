"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Clock3, Loader2 } from "lucide-react";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { ButtonLink, Card, CardBody, CardHeader, Input, Notice } from "@/components/ui/primitives";
import type { ActionResult } from "@/lib/actions";
import { loadClientOptions, loadPropertyOptions, type PropertyInfo } from "../actions";
import { PRIORITIES, SOURCES } from "../_lib/constants";
import { fromLondon, toLondonInput } from "../_lib/time";
import type { ContractOption, Option, PropertyOption } from "../_lib/types";

export type JobFormValues = {
  id?: string;
  organisation_id: string;
  property_id: string;
  contract_id: string;
  occupant_id: string;
  title: string;
  description: string;
  work_category: string;
  trade: string;
  priority: string;
  source: string;
  client_reference: string;
  reported_at: string; // London datetime-local
  target_attend_at: string;
  target_completion_at: string;
  estimated_hours: string;
  estimated_cost: string;
  not_to_exceed: string;
  requires_approval: boolean;
  access_notes: string;
  manager_id: string;
  status: string;
  intake_id: string;
};

type Sla = ContractOption["slas"][number];

function slaTargets(contract: ContractOption | undefined, priority: string, reported: string): { sla: Sla | null; attend: string | null; complete: string | null } {
  const sla = contract?.slas.find((s) => s.priority === priority) ?? null;
  const base = fromLondon(reported);
  if (!sla || !base) return { sla, attend: null, complete: null };
  const plus = (h: number | null) => (h ? toLondonInput(new Date(base.getTime() + h * 3_600_000)) : null);
  return { sla, attend: plus(sla.attend_hours), complete: plus(sla.complete_hours) };
}

const hours = (h: number | null) => (h === null ? "-" : h % 24 === 0 && h >= 48 ? `${h / 24} days` : `${h} h`);

export function JobForm({
  mode,
  action,
  initial,
  clients,
  initialClientData,
  initialPropertyInfo,
  categories,
  trades,
  statuses,
  managers,
  canOccupants,
  cancelHref,
}: {
  mode: "create" | "edit";
  action: (s: ActionResult, fd: FormData) => Promise<ActionResult>;
  initial: JobFormValues;
  clients: Option[];
  initialClientData: { properties: PropertyOption[]; contracts: ContractOption[] } | null;
  initialPropertyInfo: PropertyInfo | null;
  categories: Option[];
  trades: Option[];
  statuses: Option[];
  managers: Option[];
  canOccupants: boolean;
  cancelHref: string;
}) {
  const [org, setOrg] = useState(initial.organisation_id);
  const [data, setData] = useState(initialClientData ?? { properties: [], contracts: [] });
  const [property, setProperty] = useState(initial.property_id);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [info, setInfo] = useState<PropertyInfo | null>(initialPropertyInfo);
  const [contract, setContract] = useState(initial.contract_id);
  const [occupant, setOccupant] = useState(initial.occupant_id);
  const [priority, setPriority] = useState(initial.priority);
  const [reported, setReported] = useState(initial.reported_at);
  // In create mode the targets start from the SLA; when editing, the saved values stand
  // until the user changes the contract, priority or reported time.
  const [attend, setAttend] = useState(() =>
    mode === "create" && !initial.target_attend_at ? (slaTargets(initialClientData?.contracts.find((c) => c.id === initial.contract_id), initial.priority, initial.reported_at).attend ?? "") : initial.target_attend_at,
  );
  const [complete, setComplete] = useState(() =>
    mode === "create" && !initial.target_completion_at
      ? (slaTargets(initialClientData?.contracts.find((c) => c.id === initial.contract_id), initial.priority, initial.reported_at).complete ?? "")
      : initial.target_completion_at,
  );
  const [touched, setTouched] = useState({ attend: Boolean(initial.target_attend_at), complete: Boolean(initial.target_completion_at) });
  const [loading, start] = useTransition();

  const contractObj = data.contracts.find((c) => c.id === contract);
  const current = slaTargets(contractObj, priority, reported);

  const applySla = (nextContract: string, nextPriority: string, nextReported: string, contracts = data.contracts) => {
    const t = slaTargets(
      contracts.find((c) => c.id === nextContract),
      nextPriority,
      nextReported,
    );
    if (!touched.attend) setAttend(t.attend ?? "");
    if (!touched.complete) setComplete(t.complete ?? "");
  };

  const chooseOrg = (id: string) => {
    setOrg(id);
    setProperty("");
    setContract("");
    setOccupant("");
    setInfo(null);
    setPropertyFilter("");
    if (!id) {
      setData({ properties: [], contracts: [] });
      return;
    }
    start(async () => {
      const next = await loadClientOptions(id);
      setData(next);
      const active = next.contracts.filter((c) => c.status === "active");
      if (active.length === 1) {
        setContract(active[0].id);
        applySla(active[0].id, priority, reported, next.contracts);
      } else applySla("", priority, reported, next.contracts);
    });
  };

  const chooseProperty = (id: string) => {
    setProperty(id);
    setOccupant("");
    setInfo(null);
    if (!id) return;
    start(async () => {
      const next = await loadPropertyOptions(id);
      setInfo(next);
      // pick the contract that covers this property when none is chosen yet
      if (next && !contract) {
        const covering = data.contracts.find((c) => next.contractIds.includes(c.id));
        if (covering) {
          setContract(covering.id);
          applySla(covering.id, priority, reported);
        }
      }
      if (next?.occupants?.length === 1) setOccupant(next.occupants[0].id);
    });
  };

  const filteredProperties = useMemo(() => {
    const q = propertyFilter.trim().toLowerCase();
    const list = q ? data.properties.filter((p) => `${p.reference} ${p.address} ${p.postcode} ${p.town}`.toLowerCase().includes(q)) : data.properties;
    const shown = list.slice(0, 300);
    if (property && !shown.some((p) => p.id === property)) {
      const sel = data.properties.find((p) => p.id === property);
      if (sel) shown.unshift(sel);
    }
    return shown.map((p) => ({ value: p.id, label: `${p.address}, ${p.town} ${p.postcode} · ${p.reference}` }));
  }, [data.properties, propertyFilter, property]);

  return (
    <ActionForm action={action} className="grid gap-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {initial.intake_id && <input type="hidden" name="intake_id" value={initial.intake_id} />}

      <Card>
        <CardHeader title="Client & property" description="The property must belong to the client; the contract sets the SLA targets." actions={loading ? <Loader2 className="size-4 animate-spin text-accent-hi" aria-label="Loading" /> : null} />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <SelectField name="organisation_id" label="Client" required options={clients} placeholder="Choose a client…" value={org} onChange={(e) => chooseOrg(e.target.value)} />
          <SelectField
            name="contract_id"
            label="Contract"
            options={data.contracts.map((c) => ({ value: c.id, label: c.label }))}
            placeholder={org ? (data.contracts.length ? "No contract (ad-hoc work)" : "This client has no live contracts") : "Choose a client first"}
            value={contract}
            disabled={!org}
            onChange={(e) => {
              setContract(e.target.value);
              applySla(e.target.value, priority, reported);
            }}
          />
          <div className="md:col-span-2">
            <div className="grid gap-2 md:grid-cols-[minmax(0,240px)_1fr] md:items-end">
              <div>
                <label htmlFor="property-filter" className="mb-1.5 block text-[13px] font-medium text-muted">
                  Find property
                </label>
                <Input
                  id="property-filter"
                  type="search"
                  placeholder={org ? `Filter ${data.properties.length} properties…` : "Choose a client first"}
                  value={propertyFilter}
                  disabled={!org}
                  onChange={(e) => setPropertyFilter(e.target.value)}
                />
              </div>
              <SelectField
                name="property_id"
                label="Property"
                required
                options={filteredProperties}
                placeholder={org ? (filteredProperties.length ? "Choose a property…" : "No property matches") : "Choose a client first"}
                value={property}
                disabled={!org}
                onChange={(e) => chooseProperty(e.target.value)}
              />
            </div>
          </div>
          {info && (info.hazards.length > 0 || info.restrictions || info.access_notes) && (
            <div className="md:col-span-2">
              <Notice tone="warn" title="Before anyone attends this property">
                {info.hazards.length > 0 && <p>Hazards: {info.hazards.map((h) => h.replace(/_/g, " ")).join(", ")}</p>}
                {info.restrictions && <p>Restrictions: {info.restrictions}</p>}
                {info.access_notes && <p>Access: {info.access_notes}</p>}
              </Notice>
            </div>
          )}
          {canOccupants ? (
            <SelectField
              name="occupant_id"
              label="Occupant"
              options={(info?.occupants ?? []).map((o) => ({ value: o.id, label: o.phone ? `${o.name} · ${o.phone}` : o.name }))}
              placeholder={!property ? "Choose a property first" : info?.occupants?.length ? "Not linked to an occupant" : "No current occupant recorded"}
              value={occupant}
              disabled={!property}
              onChange={(e) => setOccupant(e.target.value)}
              hint="Contact details stay in the occupant record; only the link is stored on the job."
            />
          ) : (
            <p className="self-end text-xs text-subtle">Occupant details need the occupant data permission.</p>
          )}
          <TextField name="client_reference" label="Client reference" defaultValue={initial.client_reference} maxLength={60} placeholder="e.g. KB-55120" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="The work" />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <TextField name="title" label="Title" required defaultValue={initial.title} maxLength={200} className="md:col-span-2" placeholder="e.g. Water coming through kitchen ceiling" />
          <TextAreaField name="description" label="Description" defaultValue={initial.description} maxLength={20000} className="md:col-span-2" rows={5} />
          <SelectField name="work_category" label="Work category" required options={categories} placeholder="Choose a category…" defaultValue={initial.work_category} />
          <SelectField name="trade" label="Trade" required options={trades} placeholder="Choose a trade…" defaultValue={initial.trade} />
          <SelectField
            name="priority"
            label="Priority"
            required
            options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))}
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              applySla(contract, e.target.value, reported);
            }}
          />
          <SelectField name="source" label="Received by" required options={SOURCES.map((s) => ({ value: s.value, label: s.label }))} defaultValue={initial.source} />
          {mode === "create" && (
            <SelectField name="status" label="Starting status" required options={statuses} defaultValue={initial.status} hint="New jobs start in an intake or pre-works status; the workflow takes them on from there." />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Dates & SLA"
          description={
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-3.5" aria-hidden />
              {!contract
                ? "No contract chosen: set the targets yourself."
                : current.sla
                  ? `Contract SLA for ${priority}: attend within ${hours(current.sla.attend_hours)}, complete within ${hours(current.sla.complete_hours)} of the reported time.`
                  : `This contract has no SLA for ${priority} jobs: set the targets yourself.`}
            </span>
          }
        />
        <CardBody className="grid gap-4 md:grid-cols-3">
          <TextField
            name="reported_at"
            label="Reported"
            type="datetime-local"
            required
            value={reported}
            onChange={(e) => {
              setReported(e.target.value);
              applySla(contract, priority, e.target.value);
            }}
          />
          <TextField
            name="target_attend_at"
            label="Target attendance"
            type="datetime-local"
            value={attend}
            onChange={(e) => {
              setAttend(e.target.value);
              setTouched((t) => ({ ...t, attend: true }));
            }}
            hint={touched.attend && current.attend && attend !== current.attend ? <ResetLink onClick={() => { setAttend(current.attend!); setTouched((t) => ({ ...t, attend: false })); }} /> : current.attend ? "From the SLA" : undefined}
          />
          <TextField
            name="target_completion_at"
            label="Target completion"
            type="datetime-local"
            value={complete}
            onChange={(e) => {
              setComplete(e.target.value);
              setTouched((t) => ({ ...t, complete: true }));
            }}
            hint={
              touched.complete && current.complete && complete !== current.complete ? (
                <ResetLink onClick={() => { setComplete(current.complete!); setTouched((t) => ({ ...t, complete: false })); }} />
              ) : current.complete ? (
                "From the SLA"
              ) : undefined
            }
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Estimate, approval & ownership" />
        <CardBody className="grid gap-4 md:grid-cols-3">
          <TextField name="estimated_hours" label="Estimated hours" type="number" min={0} step={0.25} defaultValue={initial.estimated_hours} inputMode="decimal" />
          <TextField name="estimated_cost" label="Estimated cost (£)" type="number" min={0} step={0.01} defaultValue={initial.estimated_cost} inputMode="decimal" />
          <TextField name="not_to_exceed" label="Not to exceed (£)" type="number" min={0} step={0.01} defaultValue={initial.not_to_exceed} inputMode="decimal" hint="The client's spending limit without further approval." />
          <SelectField name="manager_id" label="Job manager" options={managers} placeholder="No manager" defaultValue={initial.manager_id} />
          <div className="md:col-span-2 md:self-end md:pb-2">
            <CheckboxField name="requires_approval" label="Requires approval before work starts" defaultChecked={initial.requires_approval} hint="For work above the not-to-exceed limit or that needs the client's sign-off." />
          </div>
          <TextAreaField name="access_notes" label="Access notes for this job" defaultValue={initial.access_notes} maxLength={2000} className="md:col-span-3" rows={3} placeholder="Keys, parking, appointment windows…" />
        </CardBody>
      </Card>

      {info?.hazards.includes("asbestos") && (
        <Notice tone="warn">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="size-4" aria-hidden /> Asbestos is recorded at this property. Only operatives with asbestos awareness should be assigned.
          </span>
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        <SubmitButton pendingLabel={mode === "create" ? "Creating…" : "Saving…"}>{mode === "create" ? "Create job" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function ResetLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-accent-hi hover:underline">
      Changed by you · reset to SLA
    </button>
  );
}
