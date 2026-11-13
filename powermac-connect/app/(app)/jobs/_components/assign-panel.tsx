"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, MapPin, Search, ShieldAlert, Sparkles, UserPlus } from "lucide-react";
import { Badge, buttonClass, Card, CardBody, CardHeader, cx, Input, Label, Notice, Select } from "@/components/ui/primitives";
import { assignJob, recommendOperatives, type AssignResult, type Clash, type Recommendation } from "../[id]/actions";
import { MAX_DAY_HOURS } from "../_lib/constants";

type Sub = { id: string; name: string; insuranceExpiry: string | null; expired: boolean; trades: string };
type Pending = { kind: "employee"; id: string; name: string } | { kind: "subcontractor"; id: string; name: string };

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export function AssignPanel({
  jobId,
  defaultDay,
  defaultTime,
  defaultDuration,
  defaultRole,
  tradeLabels,
  subcontractors,
}: {
  jobId: string;
  defaultDay: string;
  defaultTime: string;
  defaultDuration: number;
  defaultRole: "lead" | "support";
  tradeLabels: Record<string, string>;
  subcontractors: Sub[];
}) {
  const [day, setDay] = useState(defaultDay);
  const [startTime, setStartTime] = useState(defaultTime);
  const [duration, setDuration] = useState(String(defaultDuration));
  const [role, setRole] = useState<"lead" | "support" | "supervisor">(defaultRole);
  const [rows, setRows] = useState<Recommendation[] | null>(null);
  const [slot, setSlot] = useState<{ start: string; end: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ who: Pending; result: AssignResult } | null>(null);
  const [sub, setSub] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const find = () => {
    setError(null);
    setSuccess(null);
    setConfirming(null);
    start(async () => {
      const res = await recommendOperatives(jobId, day, startTime, Number(duration));
      if (!res.ok) {
        setRows(null);
        setError(res.message ?? "Could not load recommendations.");
      } else {
        setRows(res.rows ?? []);
        setSlot(res.window ?? null);
      }
    });
  };

  const assign = (who: Pending, confirm = false) => {
    setError(null);
    setSuccess(null);
    setBusy(who.id);
    start(async () => {
      const res = await assignJob({
        jobId,
        employeeId: who.kind === "employee" ? who.id : undefined,
        subcontractorId: who.kind === "subcontractor" ? who.id : undefined,
        day,
        time: startTime,
        duration: Number(duration),
        role,
        confirm,
      });
      setBusy(null);
      if (res.ok) {
        setConfirming(null);
        setSuccess(res.message ?? "Assigned.");
        setRows(null);
        setSub("");
      } else if (res.needsConfirm) setConfirming({ who, result: res });
      else setError(res.message ?? "The assignment could not be saved.");
    });
  };

  const chosenSub = subcontractors.find((s) => s.id === sub);

  return (
    <Card>
      <CardHeader
        title="Assign"
        description="Pick a slot to see operatives ranked by trade, availability, distance and workload. Recommendations are advice; you decide."
      />
      <CardBody className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
          <div>
            <Label htmlFor="assign-day">Date</Label>
            <Input id="assign-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="assign-time">Start</Label>
            <Input id="assign-time" type="time" step={900} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="assign-duration">Duration (hours, max {MAX_DAY_HOURS})</Label>
            <Input id="assign-duration" type="number" min={0.25} max={MAX_DAY_HOURS} step={0.25} value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <Label htmlFor="assign-role">Role</Label>
            <Select id="assign-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="lead">Lead</option>
              <option value="support">Support</option>
              <option value="supervisor">Supervisor</option>
            </Select>
          </div>
          <button type="button" onClick={find} disabled={pending} className={buttonClass("primary", "md", "sm:col-span-2 lg:col-span-1")}>
            {pending && !busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
            Find operatives
          </button>
        </div>

        {error && <Notice tone="bad">{error}</Notice>}
        {success && (
          <Notice tone="ok">
            {success}{" "}
            <Link href={`/schedule?date=${day}`} className="underline">
              See the day on the schedule
            </Link>
          </Notice>
        )}

        {confirming && (
          <div className="rounded-xl border border-[#5a1f1d] bg-bad-lo/60 p-4" role="alertdialog" aria-labelledby="clash-title">
            <p id="clash-title" className="flex items-center gap-2 font-semibold text-[#ffb3b1]">
              <AlertTriangle className="size-4" aria-hidden /> {confirming.result.message}
            </p>
            {confirming.result.conflicts && confirming.result.conflicts.length > 0 && (
              <ul className="mt-2 grid gap-1 text-sm text-[#ffd0ce]">
                {confirming.result.conflicts.map((c: Clash, i) => (
                  <li key={i}>
                    <span className="font-medium">{c.kind === "absence" ? "Absence" : "Booked"}:</span> {c.label} · {fmt(c.starts_at)} - {time(c.ends_at)}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={buttonClass("danger", "sm")} disabled={pending} onClick={() => assign(confirming.who, true)}>
                {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                {confirming.who.kind === "employee" ? `Assign ${confirming.who.name} anyway` : `I have checked their cover - assign ${confirming.who.name}`}
              </button>
              <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setConfirming(null)}>
                Choose someone else
              </button>
            </div>
          </div>
        )}

        {rows && (
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                <Sparkles className="size-4 text-accent-hi" aria-hidden /> Recommended operatives
              </h3>
              {slot && (
                <span className="text-xs text-muted tabular">
                  {fmt(slot.start)} - {time(slot.end)}
                </span>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="rounded-xl border border-line px-4 py-6 text-center text-sm text-muted">No active field operatives to recommend.</p>
            ) : (
              <ol className="grid gap-2" data-testid="recommendations">
                {rows.map((r, i) => {
                  const clash = r.conflicts > 0;
                  return (
                    <li
                      key={r.employee_id}
                      data-operative={r.name}
                      data-clash={clash ? "true" : "false"}
                      className={cx("grid gap-3 rounded-xl border p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center", clash ? "border-[#5a1f1d] bg-bad-lo/40" : "border-line bg-raised/40")}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 text-right text-xs text-subtle tabular">{i + 1}</span>
                        <span
                          className={cx("flex size-11 flex-col items-center justify-center rounded-xl border text-center leading-none", clash ? "border-[#5a1f1d] text-[#ff8a87]" : r.total_score >= 70 ? "border-[#18492f] text-[#5fdc98]" : "border-line-strong text-fg")}
                          title="Total score"
                        >
                          <span className="text-base font-semibold tabular">{r.total_score}</span>
                          <span className="text-[9px] text-subtle uppercase">score</span>
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: r.colour }} aria-hidden />
                          <Link href={`/workforce/${r.employee_id}`} className="font-medium text-fg hover:text-accent-hi">
                            {r.name}
                          </Link>
                          <span className="text-xs text-muted">{tradeLabels[r.trade] ?? r.trade}</span>
                          {r.distance_km !== null && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-subtle">
                              <MapPin className="size-3" aria-hidden />
                              {r.distance_km} km
                            </span>
                          )}
                          {clash && <Badge tone="bad">{r.conflicts} clash{r.conflicts === 1 ? "" : "es"}</Badge>}
                        </div>
                        <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Why">
                          {r.reasons.map((reason) => (
                            <li
                              key={reason}
                              className={cx(
                                "rounded-full border px-2 py-0.5 text-[11.5px]",
                                /clash|No asbestos|Different trade/.test(reason) ? "border-[#5a1f1d] bg-bad-lo/60 text-[#ffb3b1]" : "border-line bg-sunken text-muted",
                              )}
                            >
                              {reason}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1 text-[11px] text-subtle tabular">
                          Trade {r.trade_score} · Availability {r.availability_score} · Distance {r.distance_score} · Workload {r.workload_score}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={buttonClass(clash ? "danger" : i === 0 ? "primary" : "secondary", "sm")}
                        disabled={pending}
                        onClick={() => assign({ kind: "employee", id: r.employee_id, name: r.name })}
                        aria-label={`Assign ${r.name}`}
                      >
                        {busy === r.employee_id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <UserPlus className="size-3.5" aria-hidden />}
                        Assign
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}

        <div className="border-t border-line pt-4">
          <h3 className="mb-2 text-sm font-semibold text-fg">Or send an approved subcontractor</h3>
          {subcontractors.length === 0 ? (
            <p className="text-sm text-muted">No approved subcontractors.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
              <div>
                <Select aria-label="Subcontractor" value={sub} onChange={(e) => setSub(e.target.value)}>
                  <option value="">Choose a subcontractor…</option>
                  {subcontractors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.trades ? ` · ${s.trades}` : ""}
                      {s.expired ? " · INSURANCE EXPIRED" : ""}
                    </option>
                  ))}
                </Select>
                {chosenSub?.expired && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-[#ffc56b]">
                    <ShieldAlert className="size-4" aria-hidden /> Insurance expired on {chosenSub.insuranceExpiry}. You will be asked to confirm current cover.
                  </p>
                )}
              </div>
              <button type="button" className={buttonClass("secondary")} disabled={!sub || pending} onClick={() => chosenSub && assign({ kind: "subcontractor", id: chosenSub.id, name: chosenSub.name })}>
                {busy === sub && sub ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
                Assign subcontractor
              </button>
            </div>
          )}
          <p className="mt-2 text-xs text-subtle">Uses the same date, start, duration and role as above.</p>
        </div>
      </CardBody>
    </Card>
  );
}
