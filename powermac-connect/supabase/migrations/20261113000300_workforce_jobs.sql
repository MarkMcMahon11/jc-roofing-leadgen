-- =====================================================================================
-- POWERMAC CONNECT - 0300 Workforce, subcontractors, projects, work orders
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Vehicles & workforce
-- -------------------------------------------------------------------------------------
create table public.vehicles (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  registration  text not null check (registration ~ '^[A-Z0-9 ]{2,10}$'),
  make          text check (length(make) <= 60),
  model         text check (length(model) <= 60),
  vehicle_type  text not null default 'van' check (vehicle_type in ('van','pickup','tipper','car','trailer','plant','other')),
  status        text not null default 'active' check (status in ('active','maintenance','off_road','disposed')),
  mot_due       date,
  insurance_due date,
  service_due   date,
  tax_due       date,
  notes         text check (length(notes) <= 5000),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, registration)
);

create table public.employees (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  reference         text not null,
  user_id           uuid references public.profiles(id) on delete set null,
  first_name        text not null check (length(btrim(first_name)) between 1 and 80),
  last_name         text not null check (length(btrim(last_name)) between 1 and 80),
  job_title         text check (length(job_title) <= 120),
  trade             text not null default 'multi_trade',
  skills            text[] not null default '{}',
  work_email        text check (work_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  work_phone        text check (length(work_phone) <= 40),
  employment_status text not null default 'active' check (employment_status in ('active','on_leave','suspended','left')),
  employment_type   text not null default 'full_time' check (employment_type in ('full_time','part_time','fixed_term','apprentice','agency')),
  start_date        date,
  end_date          date,
  is_field_operative boolean not null default true,
  charge_rate       numeric(8,2) check (charge_rate >= 0),
  base_postcode     text check (length(base_postcode) <= 10),
  base_latitude     numeric(9,6) check (base_latitude between -90 and 90),
  base_longitude    numeric(9,6) check (base_longitude between -180 and 180),
  vehicle_id        uuid,
  colour            text not null default '#3b82f6' check (colour ~ '^#[0-9a-fA-F]{6}$'),
  working_hours     jsonb not null default '{"mon":[8,17],"tue":[8,17],"wed":[8,17],"thu":[8,17],"fri":[8,16]}'::jsonb,
  max_daily_hours   numeric(4,1) not null default 9 check (max_daily_hours between 1 and 16),
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  check (end_date is null or start_date is null or end_date >= start_date),
  foreign key (tenant_id, vehicle_id) references public.vehicles(tenant_id, id) on delete set null (vehicle_id)
);
create unique index employees_user_key on public.employees (tenant_id, user_id) where user_id is not null;
create index employees_trade_idx on public.employees (tenant_id, trade) where employment_status = 'active';
comment on column public.employees.charge_rate is 'Hourly SELL rate used in quotations. The pay/cost rate is personal data in employee_private.';

-- Personal data, minimised and separated (permission workforce.pii).
create table public.employee_private (
  employee_id             uuid primary key,
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  date_of_birth           date,
  ni_number               text check (ni_number ~ '^[A-CEGHJ-PR-TW-Z]{2}[0-9]{6}[A-D]$'),
  home_address            text check (length(home_address) <= 500),
  personal_phone          text check (length(personal_phone) <= 40),
  emergency_contact_name  text check (length(emergency_contact_name) <= 160),
  emergency_contact_phone text check (length(emergency_contact_phone) <= 40),
  hourly_cost             numeric(8,2) check (hourly_cost >= 0),
  notes                   text check (length(notes) <= 5000),
  id                      uuid not null default gen_random_uuid() unique,
  created_at              timestamptz not null default now(),
  created_by              uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at              timestamptz not null default now(),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete cascade
);

alter table public.memberships
  add foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete cascade;

create table public.employee_absences (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null,
  type        text not null default 'holiday',
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      text not null default 'approved' check (status in ('requested','approved','rejected','cancelled')),
  notes       text check (length(notes) <= 1000),
  approved_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  check (ends_at > starts_at),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete cascade
);
create index employee_absences_range_idx on public.employee_absences (tenant_id, employee_id, starts_at, ends_at);

create table public.subcontractors (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  reference            text not null,
  company_name         text not null check (length(btrim(company_name)) between 2 and 200),
  contact_name         text check (length(contact_name) <= 160),
  email                text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone                text check (length(phone) <= 40),
  trades               text[] not null default '{}',
  status               text not null default 'pending' check (status in ('pending','approved','suspended','archived')),
  address              text check (length(address) <= 500),
  postcode             text check (length(postcode) <= 10),
  insurance_expiry     date,
  public_liability_gbp numeric(14,2) check (public_liability_gbp >= 0),
  cis_status           text not null default 'unverified' check (cis_status in ('gross','net','higher','unverified')),
  day_rate             numeric(10,2) check (day_rate >= 0),
  rating               numeric(2,1) check (rating between 0 and 5),
  notes                text check (length(notes) <= 5000),
  created_at           timestamptz not null default now(),
  created_by           uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at           timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference)
);

alter table public.memberships
  add foreign key (tenant_id, subcontractor_id) references public.subcontractors(tenant_id, id) on delete cascade;

-- Qualifications & certifications of employees AND subcontractors (expiry alerts).
create table public.qualifications (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  employee_id        uuid,
  subcontractor_id   uuid,
  name               text not null check (length(btrim(name)) between 2 and 160),
  issuer             text check (length(issuer) <= 160),
  certificate_number text check (length(certificate_number) <= 80),
  issued_on          date,
  expires_on         date,
  document_id        uuid,
  created_at         timestamptz not null default now(),
  created_by         uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, id),
  check (num_nonnulls(employee_id, subcontractor_id) = 1),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete cascade,
  foreign key (tenant_id, subcontractor_id) references public.subcontractors(tenant_id, id) on delete cascade
);
create index qualifications_expiry_idx on public.qualifications (tenant_id, expires_on);

-- -------------------------------------------------------------------------------------
-- Projects
-- -------------------------------------------------------------------------------------
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  reference       text not null,
  organisation_id uuid not null,
  contract_id     uuid,
  name            text not null check (length(btrim(name)) between 2 and 200),
  description     text check (length(description) <= 20000),
  status          text not null default 'planning' check (status in ('planning','active','on_hold','completed','cancelled')),
  start_date      date,
  end_date        date,
  budget          numeric(14,2) check (budget >= 0),
  manager_id      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete restrict,
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete set null (contract_id)
);

create table public.project_milestones (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  project_id   uuid not null,
  name         text not null check (length(btrim(name)) between 2 and 200),
  due_date     date,
  completed_at timestamptz,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references public.projects(tenant_id, id) on delete cascade
);

-- -------------------------------------------------------------------------------------
-- Work orders - the operational heart
-- -------------------------------------------------------------------------------------
create table public.work_orders (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  reference             text not null,
  client_reference      text check (length(client_reference) <= 60),
  organisation_id       uuid not null,
  contract_id           uuid,
  property_id           uuid not null,
  project_id            uuid,
  parent_id             uuid,
  occupant_id           uuid,
  title                 text not null check (length(btrim(title)) between 3 and 200),
  description           text check (length(description) <= 20000),
  work_category         text not null default 'general_repairs',
  trade                 text not null default 'multi_trade',
  priority              text not null default 'routine' check (priority in ('emergency','urgent','routine','planned')),
  status                text not null default 'new',
  source                text not null default 'manual' check (source in ('manual','phone','email','api','portal','whatsapp','ai','bulk','inspection')),
  reported_at           timestamptz not null default now(),
  target_attend_at      timestamptz,
  target_completion_at  timestamptz,
  estimated_hours       numeric(7,2) check (estimated_hours >= 0),
  scheduled_start       timestamptz,
  scheduled_end         timestamptz,
  actual_start          timestamptz,
  actual_end            timestamptz,
  estimated_cost        numeric(14,2) check (estimated_cost >= 0),
  not_to_exceed         numeric(14,2) check (not_to_exceed >= 0),
  requires_approval     boolean not null default false,
  approved_at           timestamptz,
  approved_by           uuid references public.profiles(id) on delete set null,
  access_notes          text check (length(access_notes) <= 2000),
  completion_notes      text check (length(completion_notes) <= 10000),
  signoff_name          text check (length(signoff_name) <= 160),
  signoff_at            timestamptz,
  signoff_signature_path text,
  satisfaction_score    integer check (satisfaction_score between 1 and 5),
  first_time_fix        boolean,
  manager_id            uuid references public.profiles(id) on delete set null,
  tags                  text[] not null default '{}',
  completed_at          timestamptz,
  closed_at             timestamptz,
  created_at            timestamptz not null default now(),
  created_by            uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  check (scheduled_end is null or scheduled_start is null or scheduled_end > scheduled_start),
  check (actual_end is null or actual_start is null or actual_end >= actual_start),
  foreign key (tenant_id, status) references public.job_statuses(tenant_id, key) on update cascade,
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete restrict,
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete restrict,
  foreign key (tenant_id, property_id) references public.properties(tenant_id, id) on delete restrict,
  foreign key (tenant_id, project_id) references public.projects(tenant_id, id) on delete set null (project_id),
  foreign key (tenant_id, parent_id) references public.work_orders(tenant_id, id) on delete set null (parent_id),
  foreign key (tenant_id, occupant_id) references public.occupants(tenant_id, id) on delete set null (occupant_id)
);
create index work_orders_status_idx on public.work_orders (tenant_id, status);
create index work_orders_property_idx on public.work_orders (tenant_id, property_id);
create index work_orders_contract_idx on public.work_orders (tenant_id, contract_id);
create index work_orders_org_idx on public.work_orders (tenant_id, organisation_id);
create index work_orders_target_idx on public.work_orders (tenant_id, target_completion_at) where completed_at is null;
create index work_orders_schedule_idx on public.work_orders (tenant_id, scheduled_start);
create index work_orders_search_idx on public.work_orders using gin (to_tsvector('simple', reference || ' ' || coalesce(client_reference,'') || ' ' || title || ' ' || coalesce(description,'')));

-- The work order's property must belong to the work order's client.
create or replace function app.check_work_order_links() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.properties p where p.id = new.property_id and p.organisation_id = new.organisation_id) then
    raise exception 'property does not belong to this client' using errcode = '23514';
  end if;
  if new.contract_id is not null and not exists (select 1 from public.contracts c where c.id = new.contract_id and c.organisation_id = new.organisation_id) then
    raise exception 'contract does not belong to this client' using errcode = '23514';
  end if;
  if new.occupant_id is not null and not exists (select 1 from public.occupants o where o.id = new.occupant_id and o.property_id = new.property_id) then
    raise exception 'occupant does not live at this property' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger work_orders_links before insert or update of organisation_id, property_id, contract_id, occupant_id on public.work_orders
  for each row execute function app.check_work_order_links();

create table public.job_assignments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  work_order_id    uuid not null,
  employee_id      uuid,
  subcontractor_id uuid,
  role             text not null default 'lead' check (role in ('lead','support','supervisor')),
  scheduled_start  timestamptz not null,
  scheduled_end    timestamptz not null,
  status           text not null default 'scheduled' check (status in ('scheduled','accepted','travelling','on_site','paused','completed','cancelled','no_access')),
  arrived_at       timestamptz,
  started_at       timestamptz,
  finished_at      timestamptz,
  notes            text check (length(notes) <= 2000),
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id),
  check (num_nonnulls(employee_id, subcontractor_id) = 1),
  check (scheduled_end > scheduled_start),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete restrict,
  foreign key (tenant_id, subcontractor_id) references public.subcontractors(tenant_id, id) on delete restrict
);
create index job_assignments_wo_idx on public.job_assignments (tenant_id, work_order_id);
create index job_assignments_employee_time_idx on public.job_assignments (tenant_id, employee_id, scheduled_start) where status <> 'cancelled';
create index job_assignments_sub_time_idx on public.job_assignments (tenant_id, subcontractor_id, scheduled_start) where status <> 'cancelled';

-- Timeline / history for every job (status changes are written by trigger, see 0600).
create table public.job_updates (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null,
  author_id     uuid references public.profiles(id) on delete set null default auth.uid(),
  type          text not null check (type in ('created','note','status_change','assignment','arrival','start','finish','issue','approval_request','approval','rejection','materials','photo','signoff','client_message','system','ai')),
  from_status   text,
  to_status     text,
  body          text check (length(body) <= 10000),
  data          jsonb not null default '{}'::jsonb,
  visibility    text not null default 'internal' check (visibility in ('internal','client','occupant')),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade
);
create index job_updates_wo_idx on public.job_updates (tenant_id, work_order_id, created_at desc);
create index job_updates_recent_idx on public.job_updates (tenant_id, created_at desc);

create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid,
  property_id   uuid,
  inspection_id uuid,
  storage_path  text not null check (storage_path ~ '^[0-9a-f-]{36}/'),
  caption       text check (length(caption) <= 500),
  stage         text not null default 'during' check (stage in ('before','during','after','issue','inspection','signoff')),
  taken_at      timestamptz,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  visibility    text not null default 'client' check (visibility in ('internal','client','occupant')),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  check (num_nonnulls(work_order_id, property_id, inspection_id) >= 1),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, property_id) references public.properties(tenant_id, id) on delete cascade
);
create index photos_wo_idx on public.photos (tenant_id, work_order_id);

create table public.checklist_templates (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 2 and 160),
  work_category text,
  items         jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.job_checklists (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null,
  template_id   uuid,
  name          text not null,
  items         jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  completed_at  timestamptz,
  completed_by  uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, template_id) references public.checklist_templates(tenant_id, id) on delete set null (template_id)
);

create table public.inspections (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  reference     text not null,
  property_id   uuid not null,
  work_order_id uuid,
  type          text not null check (type in ('survey','pre_works','post_works','void','quality','compliance','stock_condition')),
  inspector_id  uuid,
  scheduled_for timestamptz,
  completed_at  timestamptz,
  result        text check (result in ('pass','fail','advisory','not_applicable')),
  score         numeric(5,2) check (score between 0 and 100),
  findings      text check (length(findings) <= 20000),
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  foreign key (tenant_id, property_id) references public.properties(tenant_id, id) on delete cascade,
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete set null (work_order_id),
  foreign key (tenant_id, inspector_id) references public.employees(tenant_id, id) on delete set null (inspector_id)
);
create index inspections_property_idx on public.inspections (tenant_id, property_id, scheduled_for desc);

alter table public.photos
  add foreign key (tenant_id, inspection_id) references public.inspections(tenant_id, id) on delete cascade;

create table public.timesheets (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  employee_id   uuid not null,
  work_order_id uuid,
  work_date     date not null,
  started_at    timestamptz,
  ended_at      timestamptz,
  hours         numeric(5,2) not null check (hours > 0 and hours <= 24),
  break_minutes integer not null default 0 check (break_minutes between 0 and 600),
  entry_type    text not null default 'labour' check (entry_type in ('labour','travel','overtime','training','yard')),
  status        text not null default 'submitted' check (status in ('draft','submitted','approved','rejected')),
  cost_amount   numeric(12,2) check (cost_amount >= 0),
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,
  notes         text check (length(notes) <= 2000),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  check (ended_at is null or started_at is null or ended_at > started_at),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete restrict,
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete set null (work_order_id)
);
create index timesheets_employee_date_idx on public.timesheets (tenant_id, employee_id, work_date);
create index timesheets_wo_idx on public.timesheets (tenant_id, work_order_id);
comment on column public.timesheets.cost_amount is 'Labour cost = hours x the employee''s private hourly cost. Set by trigger; never typed in.';

-- Labour cost from the protected pay rate, computed server-side.
create or replace function app.timesheet_cost() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_rate numeric;
begin
  select ep.hourly_cost into v_rate from public.employee_private ep where ep.employee_id = new.employee_id;
  new.cost_amount := case when v_rate is null then null
                          else round(v_rate * new.hours * case when new.entry_type = 'overtime' then 1.5 else 1 end, 2) end;
  return new;
end $$;
create trigger timesheets_cost before insert or update of hours, employee_id, entry_type on public.timesheets
  for each row execute function app.timesheet_cost();
