-- =====================================================================================
-- POWERMAC CONNECT - 0200 CRM, contracts, properties
-- Three relationships are modelled separately:
--   CONTRACTUAL CLIENT  -> organisations (+ contacts, contracts)
--   PROPERTY OCCUPANT   -> occupants (personal data, separate table, own permission)
--   DELIVERY TEAM       -> employees / subcontractors / suppliers (0300, 0400)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Corporate CRM
-- -------------------------------------------------------------------------------------
create table public.organisations (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  reference           text not null,
  name                text not null check (length(btrim(name)) between 2 and 200),
  category            text not null default 'other',
  status              text not null default 'active' check (status in ('prospect','active','inactive')),
  company_number      text check (length(company_number) <= 20),
  vat_number          text check (length(vat_number) <= 20),
  website             text check (length(website) <= 200),
  email               text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone               text check (length(phone) <= 40),
  address_line1       text check (length(address_line1) <= 200),
  address_line2       text check (length(address_line2) <= 200),
  town                text check (length(town) <= 100),
  postcode            text check (length(postcode) <= 10),
  account_manager_id  uuid references public.profiles(id) on delete set null,
  contract_manager_id uuid references public.profiles(id) on delete set null,
  payment_terms_days  integer not null default 30 check (payment_terms_days between 0 and 365),
  credit_limit        numeric(14,2) check (credit_limit >= 0),
  portal_enabled      boolean not null default false,
  tags                text[] not null default '{}',
  notes               text check (length(notes) <= 10000),
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference)
);
create index organisations_tenant_name_idx on public.organisations (tenant_id, lower(name));
create index organisations_tenant_status_idx on public.organisations (tenant_id, status);

create table public.contacts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  organisation_id   uuid not null,
  first_name        text not null check (length(btrim(first_name)) between 1 and 80),
  last_name         text not null default '' check (length(last_name) <= 80),
  job_title         text check (length(job_title) <= 120),
  email             text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone             text check (length(phone) <= 40),
  mobile            text check (length(mobile) <= 40),
  is_primary        boolean not null default false,
  is_billing        boolean not null default false,
  preferred_channel text not null default 'email' check (preferred_channel in ('email','phone','sms','whatsapp','post')),
  notes             text check (length(notes) <= 5000),
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete cascade
);
create index contacts_org_idx on public.contacts (tenant_id, organisation_id);
create unique index contacts_one_primary on public.contacts (organisation_id) where is_primary and archived_at is null;

alter table public.memberships
  add foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete cascade;

create table public.crm_opportunities (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  reference           text not null,
  organisation_id     uuid not null,
  contact_id          uuid,
  title               text not null check (length(btrim(title)) between 2 and 200),
  description         text check (length(description) <= 10000),
  stage               text not null default 'lead' check (stage in ('lead','qualified','tender','proposal','negotiation','won','lost')),
  value               numeric(14,2) not null default 0 check (value >= 0),
  probability         integer not null default 10 check (probability between 0 and 100),
  expected_close_date date,
  owner_id            uuid references public.profiles(id) on delete set null,
  source              text,
  lost_reason         text check (length(lost_reason) <= 1000),
  contract_id         uuid,
  closed_at           timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete cascade,
  foreign key (tenant_id, contact_id) references public.contacts(tenant_id, id) on delete set null (contact_id)
);
create index crm_opportunities_stage_idx on public.crm_opportunities (tenant_id, stage);

create table public.crm_activities (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  organisation_id uuid not null,
  contact_id      uuid,
  opportunity_id  uuid,
  type            text not null check (type in ('note','call','meeting','email','follow_up','task')),
  subject         text not null check (length(btrim(subject)) between 1 and 200),
  body            text check (length(body) <= 10000),
  due_at          timestamptz,
  completed_at    timestamptz,
  owner_id        uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete cascade,
  foreign key (tenant_id, contact_id) references public.contacts(tenant_id, id) on delete set null (contact_id),
  foreign key (tenant_id, opportunity_id) references public.crm_opportunities(tenant_id, id) on delete set null (opportunity_id)
);
create index crm_activities_org_idx on public.crm_activities (tenant_id, organisation_id, created_at desc);
create index crm_activities_due_idx on public.crm_activities (tenant_id, owner_id, due_at) where completed_at is null and due_at is not null;

-- -------------------------------------------------------------------------------------
-- Contracts
-- -------------------------------------------------------------------------------------
create table public.contracts (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  reference           text not null,
  client_reference    text check (length(client_reference) <= 60),
  organisation_id     uuid not null,
  title               text not null check (length(btrim(title)) between 2 and 200),
  contract_type       text not null default 'responsive_repairs',
  scope_of_work       text check (length(scope_of_work) <= 20000),
  status              text not null default 'draft' check (status in ('draft','tender','active','on_hold','expired','terminated','completed')),
  value               numeric(14,2) not null default 0 check (value >= 0),
  annual_budget       numeric(14,2) check (annual_budget >= 0),
  start_date          date,
  end_date            date,
  renewal_date        date,
  notice_period_days  integer check (notice_period_days between 0 and 730),
  payment_terms_days  integer not null default 30 check (payment_terms_days between 0 and 365),
  retention_percent   numeric(5,2) not null default 0 check (retention_percent between 0 and 100),
  pricing_basis       text not null default 'schedule_of_rates' check (pricing_basis in ('schedule_of_rates','fixed_price','cost_plus','day_rate','mixed')),
  contract_manager_id uuid references public.profiles(id) on delete set null,
  client_contact_id   uuid,
  auto_renew          boolean not null default false,
  notes               text check (length(notes) <= 10000),
  created_at          timestamptz not null default now(),
  created_by          uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  check (end_date is null or start_date is null or end_date >= start_date),
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete restrict,
  foreign key (tenant_id, client_contact_id) references public.contacts(tenant_id, id) on delete set null (client_contact_id)
);
create index contracts_org_idx on public.contracts (tenant_id, organisation_id);
create index contracts_status_end_idx on public.contracts (tenant_id, status, end_date);

alter table public.crm_opportunities
  add foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete set null (contract_id);

create table public.contract_slas (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  contract_id      uuid not null,
  priority         text not null check (priority in ('emergency','urgent','routine','planned')),
  response_hours   numeric(7,2) check (response_hours > 0),
  attend_hours     numeric(7,2) check (attend_hours > 0),
  complete_hours   numeric(8,2) check (complete_hours > 0),
  description      text check (length(description) <= 500),
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id),
  unique (contract_id, priority),
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete cascade
);

create table public.contract_kpis (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  contract_id  uuid not null,
  name         text not null check (length(btrim(name)) between 2 and 120),
  metric_key   text not null check (metric_key in ('on_time_completion','first_time_fix','sla_response','customer_satisfaction','jobs_completed','cost_variance','custom')),
  target_value numeric(10,2) not null,
  unit         text not null default '%' check (length(unit) <= 10),
  direction    text not null default 'higher_better' check (direction in ('higher_better','lower_better')),
  manual_value numeric(10,2),
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete cascade
);

create table public.contract_variations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  reference    text not null,
  contract_id  uuid not null,
  title        text not null check (length(btrim(title)) between 2 and 200),
  description  text check (length(description) <= 10000),
  value        numeric(14,2) not null default 0,
  status       text not null default 'proposed' check (status in ('proposed','approved','rejected','withdrawn')),
  approved_by  uuid references public.profiles(id) on delete set null,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  check ((status = 'approved') = (approved_at is not null)),
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete cascade
);

-- -------------------------------------------------------------------------------------
-- Properties & occupants
-- -------------------------------------------------------------------------------------
create table public.properties (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  reference       text not null,
  client_reference text check (length(client_reference) <= 60),
  uprn            text check (uprn ~ '^[0-9]{1,12}$'),
  organisation_id uuid not null,
  address_line1   text not null check (length(btrim(address_line1)) between 2 and 200),
  address_line2   text check (length(address_line2) <= 200),
  town            text not null check (length(btrim(town)) between 2 and 100),
  postcode        text not null check (length(btrim(postcode)) between 2 and 10),
  latitude        numeric(9,6) check (latitude between -90 and 90),
  longitude       numeric(9,6) check (longitude between -180 and 180),
  property_type   text not null default 'house',
  tenure          text not null default 'social_rent' check (tenure in ('social_rent','mid_market','private_rent','owner_occupied','commercial','education','public_building','other')),
  status          text not null default 'occupied' check (status in ('occupied','void','under_works','inactive')),
  bedrooms        integer check (bedrooms between 0 and 50),
  build_year      integer check (build_year between 1500 and 2100),
  access_notes    text check (length(access_notes) <= 2000),
  restrictions    text check (length(restrictions) <= 2000),
  hazards         text[] not null default '{}',
  key_safe_info   text check (length(key_safe_info) <= 200),
  notes           text check (length(notes) <= 10000),
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  check ((latitude is null) = (longitude is null)),
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete restrict
);
create index properties_org_idx on public.properties (tenant_id, organisation_id);
create index properties_postcode_idx on public.properties (tenant_id, upper(replace(postcode, ' ', '')));
create index properties_search_idx on public.properties using gin (to_tsvector('simple', coalesce(reference,'') || ' ' || address_line1 || ' ' || coalesce(address_line2,'') || ' ' || town || ' ' || postcode));
comment on column public.properties.key_safe_info is 'Access code hints. Treat as confidential; visible only to staff with properties.read.';

create table public.contract_properties (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null,
  property_id uuid not null,
  added_at    timestamptz not null default now(),
  primary key (contract_id, property_id),
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete cascade,
  foreign key (tenant_id, property_id) references public.properties(tenant_id, id) on delete cascade
);
create index contract_properties_property_idx on public.contract_properties (property_id);

-- Occupant personal data (UK GDPR): kept apart from the property, separate permission,
-- vulnerability flags are special-category style data - only what is needed for safe access.
create table public.occupants (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  property_id         uuid not null,
  full_name           text not null check (length(btrim(full_name)) between 1 and 160),
  phone               text check (length(phone) <= 40),
  email               text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  preferred_contact   text not null default 'phone' check (preferred_contact in ('phone','sms','email','whatsapp','letter','via_client')),
  is_current          boolean not null default true,
  move_in_date        date,
  move_out_date       date,
  access_needs        text check (length(access_needs) <= 1000),
  vulnerability_flags text[] not null default '{}' check (vulnerability_flags <@ array['mobility','hearing','sight','language','elderly','medical','mental_health','safeguarding','other']::text[]),
  consent_to_contact  boolean not null default true,
  portal_enabled      boolean not null default false,
  anonymised_at       timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  check (move_out_date is null or move_in_date is null or move_out_date >= move_in_date),
  foreign key (tenant_id, property_id) references public.properties(tenant_id, id) on delete cascade
);
create index occupants_property_idx on public.occupants (tenant_id, property_id) where is_current;
comment on table public.occupants is 'Personal data of residents. Access needs permission occupants.read. Values are redacted in the audit log; anonymised by the retention job after move-out.';

alter table public.memberships
  add foreign key (tenant_id, occupant_id) references public.occupants(tenant_id, id) on delete cascade;
