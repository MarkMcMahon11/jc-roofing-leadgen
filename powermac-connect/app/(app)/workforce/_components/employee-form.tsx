"use client";

import Link from "next/link";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { buttonClass, Card, CardBody, CardHeader, Input, Label } from "@/components/ui/primitives";
import { CheckboxChips } from "../../properties/_components/checkbox-chips";
import { createEmployee, updateEmployee } from "../actions";
import { DAY_LABEL, DAYS, EMPLOYMENT_STATUS, EMPLOYMENT_TYPES, hoursToTime, type WorkingHours } from "../_lib/shared";

type Opt = { value: string; label: string };
export type EmployeeFormValues = {
  id?: string;
  first_name?: string;
  last_name?: string;
  job_title?: string | null;
  trade?: string;
  skills?: string[];
  work_email?: string | null;
  work_phone?: string | null;
  employment_status?: string;
  employment_type?: string;
  start_date?: string | null;
  end_date?: string | null;
  is_field_operative?: boolean;
  charge_rate?: number | null;
  base_postcode?: string | null;
  has_base_location?: boolean;
  vehicle_id?: string | null;
  colour?: string;
  working_hours?: WorkingHours;
  max_daily_hours?: number;
};

const DEFAULT_HOURS: WorkingHours = { mon: [8, 17], tue: [8, 17], wed: [8, 17], thu: [8, 17], fri: [8, 16] };

export function EmployeeForm({ values, trades, skills, vehicles }: { values: EmployeeFormValues; trades: Opt[]; skills: Opt[]; vehicles: Opt[] }) {
  const editing = Boolean(values.id);
  const hours = values.working_hours ?? DEFAULT_HOURS;
  // keep skills the person already holds even if the picklist value was retired
  const skillOptions = [...skills, ...(values.skills ?? []).filter((s) => !skills.some((o) => o.value === s)).map((s) => ({ value: s, label: s.replace(/_/g, " ") }))];
  return (
    <ActionForm action={editing ? updateEmployee : createEmployee} className="grid gap-6">
      {(state) => (
        <>
          {values.id && <input type="hidden" name="id" value={values.id} />}
          <Card>
            <CardHeader title="Person and role" />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <TextField name="first_name" label="First name" required defaultValue={values.first_name} maxLength={80} autoComplete="off" />
              <TextField name="last_name" label="Last name" required defaultValue={values.last_name} maxLength={80} autoComplete="off" />
              <TextField name="job_title" label="Job title" defaultValue={values.job_title ?? ""} maxLength={120} />
              <SelectField name="trade" label="Trade" required options={trades} defaultValue={values.trade ?? "multi_trade"} />
              <SelectField name="employment_status" label="Employment status" required options={Object.entries(EMPLOYMENT_STATUS).map(([value, s]) => ({ value, label: s.label }))} defaultValue={values.employment_status ?? "active"} />
              <SelectField name="employment_type" label="Employment type" required options={EMPLOYMENT_TYPES} defaultValue={values.employment_type ?? "full_time"} />
              <TextField name="start_date" label="Start date" type="date" defaultValue={values.start_date ?? ""} />
              <TextField name="end_date" label="End date" type="date" defaultValue={values.end_date ?? ""} hint="Only when they have left or are on a fixed term." />
              <div className="flex items-end pb-2">
                <CheckboxField name="is_field_operative" label="Field operative" hint="Can be scheduled to jobs and uses the field app." defaultChecked={values.is_field_operative ?? true} />
              </div>
              <CheckboxChips name="skills" label="Skills and tickets" options={skillOptions} defaultValues={values.skills} className="sm:col-span-2 lg:col-span-3" error={state.fieldErrors?.skills?.[0]} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Work contact and scheduling" description="Work details only. Personal data is kept separately and restricted." />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <TextField name="work_email" label="Work email" type="email" defaultValue={values.work_email ?? ""} maxLength={320} autoComplete="off" />
              <TextField name="work_phone" label="Work phone" type="tel" defaultValue={values.work_phone ?? ""} maxLength={40} autoComplete="off" />
              <TextField name="charge_rate" label="Charge rate (£ per hour, sell)" type="number" min={0} step="0.01" defaultValue={values.charge_rate ?? ""} hint="What clients are charged. Not their pay." />
              <TextField
                name="base_postcode"
                label="Base postcode"
                defaultValue={values.base_postcode ?? ""}
                maxLength={10}
                autoComplete="off"
                hint={editing && values.base_postcode && !values.has_base_location ? "No map location yet: saving retries the lookup." : "Where they start the day. Used for travel and job matching."}
              />
              <SelectField name="vehicle_id" label="Vehicle" options={vehicles} placeholder="No vehicle" defaultValue={values.vehicle_id ?? ""} />
              <div className="grid grid-cols-[auto_1fr] items-end gap-3">
                <div>
                  <Label htmlFor="emp-colour">Colour</Label>
                  <input id="emp-colour" name="colour" type="color" defaultValue={values.colour ?? "#3b82f6"} className="h-10 w-14 cursor-pointer rounded-[10px] border border-line-strong bg-sunken p-1" />
                </div>
                <TextField name="max_daily_hours" label="Max hours per day" type="number" min={1} max={16} step="0.5" required defaultValue={values.max_daily_hours ?? 9} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Working pattern" description="Leave a day blank if they do not normally work it." />
            <CardBody>
              {state.fieldErrors && Object.keys(state.fieldErrors).some((k) => k.startsWith("wh_")) && (
                <p role="alert" className="mb-3 text-sm text-[#ff9b98]">
                  {Object.entries(state.fieldErrors).find(([k]) => k.startsWith("wh_"))?.[1]?.[0]}
                </p>
              )}
              <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                {DAYS.map((d) => (
                  <div key={d} className="grid grid-cols-[minmax(0,84px)_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                    <span className="truncate text-sm text-muted">{DAY_LABEL[d]}</span>
                    <Input type="time" name={`wh_${d}_start`} step={900} className="min-w-0 px-2" defaultValue={hoursToTime(hours[d]?.[0])} aria-label={`${DAY_LABEL[d]} start`} aria-invalid={Boolean(state.fieldErrors?.[`wh_${d}_start`])} />
                    <span className="text-xs text-subtle">to</span>
                    <Input type="time" name={`wh_${d}_end`} step={900} className="min-w-0 px-2" defaultValue={hoursToTime(hours[d]?.[1])} aria-label={`${DAY_LABEL[d]} finish`} />
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton>{editing ? "Save employee" : "Add employee"}</SubmitButton>
            <Link href={values.id ? `/workforce/${values.id}` : "/workforce"} className={buttonClass("ghost")}>
              Cancel
            </Link>
          </div>
        </>
      )}
    </ActionForm>
  );
}
