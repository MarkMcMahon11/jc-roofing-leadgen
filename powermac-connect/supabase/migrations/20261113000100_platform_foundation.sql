-- =====================================================================================
-- POWERMAC CONNECT - 0100 Platform foundation
-- Multi-tenant SaaS core: plans, tenants, identity, roles & permissions, memberships,
-- per-tenant reference numbers, configurable picklists and job workflow, audit log.
--
-- Conventions used by every business table (see 0600 for the generic triggers/policies):
--   id uuid pk, tenant_id uuid not null (-> tenants, cascade), created_at, created_by, updated_at
--   unique (tenant_id, id) so child tables can use COMPOSITE foreign keys
--   (tenant_id, parent_id) -> parent(tenant_id, id). The database itself therefore makes it
--   impossible for a row in one tenant to reference a row in another tenant.
-- =====================================================================================

create schema if not exists app;
comment on schema app is 'Private helper functions for RLS, triggers and provisioning. Not exposed through the Data API.';
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- Plans & tenants (BPOAI.AI platform level)
-- -------------------------------------------------------------------------------------
create table public.plans (
  key               text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  name              text not null,
  monthly_price_gbp numeric(10,2) not null default 0 check (monthly_price_gbp >= 0),
  included_users    integer not null default 5 check (included_users > 0),
  features          jsonb not null default '{}'::jsonb,
  is_public         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);
comment on table public.plans is 'Subscription plans BPOAI.AI sells. Prices are configurable list prices.';

insert into public.plans (key, name, monthly_price_gbp, included_users, sort_order, features) values
  ('trial',        'Trial',        0,    10,  0, '{"ai": true, "client_portal": true, "max_properties": 500}'),
  ('professional', 'Professional', 799,  40,  1, '{"ai": true, "client_portal": true, "max_properties": 20000}'),
  ('enterprise',   'Enterprise',   1999, 250, 2, '{"ai": true, "client_portal": true, "max_properties": null, "sso": true}');

create table public.tenants (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  name                text not null check (length(btrim(name)) between 2 and 160),
  legal_name          text check (length(legal_name) <= 200),
  company_number      text check (length(company_number) <= 20),
  vat_number          text check (length(vat_number) <= 20),
  plan_key            text not null default 'trial' references public.plans(key),
  subscription_status text not null default 'trial'
                      check (subscription_status in ('trial','active','past_due','suspended','cancelled')),
  trial_ends_at       timestamptz,
  seats               integer not null default 10 check (seats > 0),
  is_demo             boolean not null default false,
  reference_prefix    text not null default 'PM' check (reference_prefix ~ '^[A-Z0-9]{1,6}$'),
  timezone            text not null default 'Europe/London',
  currency            text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  default_vat_rate    numeric(5,2) not null default 20.00 check (default_vat_rate between 0 and 100),
  brand_colour        text check (brand_colour ~ '^#[0-9a-fA-F]{6}$'),
  settings            jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.tenants is 'A customer company of BPOAI.AI (e.g. PowerMac). Every business row belongs to exactly one tenant.';
comment on column public.tenants.is_demo is 'Demo environment: the UI shows a permanent DEMO banner and the data is sample data.';

-- -------------------------------------------------------------------------------------
-- Identity
-- -------------------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text not null,
  full_name         text not null default '' check (length(full_name) <= 160),
  phone             text check (length(phone) <= 40),
  is_platform_admin boolean not null default false,
  last_tenant_id    uuid references public.tenants(id) on delete set null,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));
comment on column public.profiles.is_platform_admin is 'BPOAI.AI super admin. Manages tenants/plans; does NOT get tenant business data without a membership.';

-- Keep profiles in step with Supabase Auth users.
create or replace function app.handle_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_auth_user();
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function app.handle_auth_user();

-- -------------------------------------------------------------------------------------
-- Roles & permissions (configurable per tenant)
-- -------------------------------------------------------------------------------------
create table public.permissions (
  key          text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module       text not null,
  label        text not null,
  description  text not null default '',
  scopes       text[] not null default '{internal}',
  is_sensitive boolean not null default false,
  sort_order   integer not null default 0
);
comment on column public.permissions.scopes is 'Which role scope types may hold this permission.';

insert into public.permissions (key, module, label, description, scopes, is_sensitive, sort_order) values
  ('dashboard.view',        'dashboard',      'View command centre',           'Executive dashboard and alerts',                      '{internal}', false, 10),
  ('crm.read',              'crm',            'View clients & CRM',            'Organisations, contacts, pipeline, activities',       '{internal}', false, 20),
  ('crm.write',             'crm',            'Edit clients & CRM',            'Create and edit organisations, contacts, pipeline',    '{internal}', false, 21),
  ('crm.delete',            'crm',            'Delete CRM records',            '',                                                    '{internal}', false, 22),
  ('contracts.read',        'contracts',      'View contracts',                '',                                                    '{internal,client}', false, 30),
  ('contracts.write',       'contracts',      'Edit contracts',                '',                                                    '{internal}', false, 31),
  ('contracts.delete',      'contracts',      'Delete contracts',              '',                                                    '{internal}', false, 32),
  ('contracts.approve',     'contracts',      'Approve contract variations',   '',                                                    '{internal}', false, 33),
  ('properties.read',       'properties',     'View properties',               '',                                                    '{internal,client,operative,subcontractor}', false, 40),
  ('properties.write',      'properties',     'Edit properties',               '',                                                    '{internal}', false, 41),
  ('properties.delete',     'properties',     'Delete properties',             '',                                                    '{internal}', false, 42),
  ('occupants.read',        'properties',     'View tenant/occupant details',  'Personal data of people living in properties',        '{internal,client,operative,subcontractor}', true, 43),
  ('occupants.write',       'properties',     'Edit tenant/occupant details',  '',                                                    '{internal}', true, 44),
  ('work_orders.read',      'work_orders',    'View jobs',                     '',                                                    '{internal,client,operative,subcontractor,occupant}', false, 50),
  ('work_orders.write',     'work_orders',    'Create & edit jobs',            '',                                                    '{internal}', false, 51),
  ('work_orders.delete',    'work_orders',    'Delete jobs',                   '',                                                    '{internal}', false, 52),
  ('work_orders.assign',    'work_orders',    'Assign jobs',                   'Allocate operatives and subcontractors',              '{internal}', false, 53),
  ('work_orders.approve',   'work_orders',    'Approve jobs',                  'Authorise works and quotations on jobs',              '{internal}', false, 54),
  ('projects.read',         'projects',       'View projects',                 '',                                                    '{internal}', false, 60),
  ('projects.write',        'projects',       'Edit projects',                 '',                                                    '{internal}', false, 61),
  ('schedule.read',         'schedule',       'View schedule',                 '',                                                    '{internal,operative}', false, 70),
  ('schedule.write',        'schedule',       'Edit schedule',                 'Drag-and-drop allocation',                            '{internal}', false, 71),
  ('workforce.read',        'workforce',      'View workforce',                '',                                                    '{internal}', false, 80),
  ('workforce.write',       'workforce',      'Edit workforce',                '',                                                    '{internal}', false, 81),
  ('workforce.pii',         'workforce',      'View employee personal data',   'Date of birth, NI number, home address, pay rate',    '{internal}', true, 82),
  ('subcontractors.read',   'subcontractors', 'View subcontractors',           '',                                                    '{internal}', false, 90),
  ('subcontractors.write',  'subcontractors', 'Edit subcontractors',           '',                                                    '{internal}', false, 91),
  ('suppliers.read',        'procurement',    'View suppliers',                '',                                                    '{internal}', false, 100),
  ('suppliers.write',       'procurement',    'Edit suppliers',                '',                                                    '{internal}', false, 101),
  ('procurement.read',      'procurement',    'View purchasing',               'Requisitions, purchase orders, goods received',       '{internal}', false, 102),
  ('procurement.write',     'procurement',    'Raise purchasing',              '',                                                    '{internal}', false, 103),
  ('procurement.approve',   'procurement',    'Approve purchasing',            '',                                                    '{internal}', false, 104),
  ('inventory.read',        'inventory',      'View stock',                    '',                                                    '{internal}', false, 110),
  ('inventory.write',       'inventory',      'Edit stock',                    '',                                                    '{internal}', false, 111),
  ('quotes.read',           'quotes',         'View quotations',               '',                                                    '{internal,client}', false, 120),
  ('quotes.write',          'quotes',         'Prepare quotations',            '',                                                    '{internal}', false, 121),
  ('quotes.approve',        'quotes',         'Approve quotations',            'Internal sign-off, or client acceptance in the portal', '{internal,client}', false, 122),
  ('finance.read',          'finance',        'View finance',                  'Revenue, costs, invoices, profitability',             '{internal,client}', true, 130),
  ('finance.write',         'finance',        'Edit finance',                  'Invoices, payments, costs',                           '{internal}', true, 131),
  ('documents.read',        'documents',      'View documents',                '',                                                    '{internal,client,operative,subcontractor}', false, 140),
  ('documents.write',       'documents',      'Upload documents',              '',                                                    '{internal,client}', false, 141),
  ('documents.delete',      'documents',      'Delete documents',              '',                                                    '{internal}', false, 142),
  ('communications.read',   'communications', 'View communications',           '',                                                    '{internal,client,occupant}', false, 150),
  ('communications.write',  'communications', 'Send communications',           '',                                                    '{internal,client,occupant}', false, 151),
  ('ai.use',                'ai',             'Use PowerMac AI',               '',                                                    '{internal}', false, 160),
  ('automations.read',      'automations',    'View automations',              '',                                                    '{internal}', false, 170),
  ('automations.manage',    'automations',    'Manage automations',            '',                                                    '{internal}', false, 171),
  ('reports.view',          'reports',        'View reports',                  '',                                                    '{internal,client}', false, 180),
  ('settings.manage',       'settings',       'Manage company settings',       'Workflow, picklists, integrations, retention',        '{internal}', true, 190),
  ('users.manage',          'settings',       'Manage users & roles',          '',                                                    '{internal}', true, 191),
  ('audit.view',            'settings',       'View audit log',                '',                                                    '{internal}', true, 192),
  ('portal.request',        'portal',         'Submit work requests',          'Client portal repair requests',                       '{client,occupant}', false, 200),
  ('field.update',          'field',          'Update assigned jobs',          'Arrival, start/finish, photos, materials, sign-off',  '{operative,subcontractor}', false, 210);

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name        text not null check (length(btrim(name)) between 2 and 80),
  description text not null default '' check (length(description) <= 500),
  scope_type  text not null check (scope_type in ('internal','client','operative','subcontractor','occupant')),
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, key),
  unique (tenant_id, id)
);
comment on column public.roles.scope_type is 'internal = PowerMac staff; client = corporate client portal; operative = own employee assignments; subcontractor; occupant = tenant living in a property.';

create table public.role_permissions (
  tenant_id      uuid not null,
  role_id        uuid not null,
  permission_key text not null references public.permissions(key) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (role_id, permission_key),
  foreign key (tenant_id, role_id) references public.roles(tenant_id, id) on delete cascade
);
create index role_permissions_tenant_idx on public.role_permissions (tenant_id);

create table public.memberships (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  role_id          uuid not null,
  status           text not null default 'active' check (status in ('invited','active','suspended')),
  -- scope links (foreign keys added in later migrations once the tables exist)
  organisation_id  uuid,
  employee_id      uuid,
  subcontractor_id uuid,
  occupant_id      uuid,
  invited_by       uuid references public.profiles(id) on delete set null,
  invited_at       timestamptz,
  accepted_at      timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, id),
  foreign key (tenant_id, role_id) references public.roles(tenant_id, id) on delete restrict
);
create index memberships_user_idx on public.memberships (user_id) where status = 'active';
create index memberships_role_idx on public.memberships (role_id);

-- -------------------------------------------------------------------------------------
-- RLS helper functions. SECURITY DEFINER so they can read membership tables without
-- recursive policy evaluation; they only ever answer questions about auth.uid().
-- Return sets so policies can use `tenant_id in (select app.fn(...))`: an uncorrelated
-- subquery the planner evaluates once per statement (hashed subplan), not once per row.
-- -------------------------------------------------------------------------------------
create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_platform_admin from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function app.member_tenants() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.tenant_id
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = auth.uid() and m.status = 'active'
    and t.subscription_status in ('trial','active','past_due')
$$;

-- Tenants in which the current user is INTERNAL staff holding p_perm.
create or replace function app.internal_perm_tenants(p_perm text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.tenant_id
  from public.memberships m
  join public.roles r on r.id = m.role_id and r.scope_type = 'internal'
  join public.role_permissions rp on rp.role_id = m.role_id and rp.permission_key = p_perm
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = auth.uid() and m.status = 'active'
    and t.subscription_status in ('trial','active','past_due')
$$;

-- Does the current user hold p_perm in p_tenant (any scope)?
create or replace function app.has_perm(p_tenant uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id and rp.permission_key = p_perm
    join public.tenants t on t.id = m.tenant_id
    where m.user_id = auth.uid() and m.tenant_id = p_tenant and m.status = 'active'
      and t.subscription_status in ('trial','active','past_due')
  )
$$;

-- The current user's membership in a tenant (scope + linked entity) for portal/field RPCs.
create or replace function app.my_membership(p_tenant uuid)
returns table (membership_id uuid, role_id uuid, scope_type text, organisation_id uuid, employee_id uuid, subcontractor_id uuid, occupant_id uuid)
language sql stable security definer set search_path = '' as $$
  select m.id, m.role_id, r.scope_type, m.organisation_id, m.employee_id, m.subcontractor_id, m.occupant_id
  from public.memberships m
  join public.roles r on r.id = m.role_id
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = auth.uid() and m.tenant_id = p_tenant and m.status = 'active'
    and t.subscription_status in ('trial','active','past_due')
$$;

create or replace function app.shares_tenant_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on b.tenant_id = a.tenant_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = p_user
  )
$$;

-- -------------------------------------------------------------------------------------
-- Generic triggers
-- -------------------------------------------------------------------------------------
-- Base-column protection: tenant_id / id / created_* are immutable, updated_at maintained.
create or replace function app.touch_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'tenant_id cannot be changed' using errcode = '42501';
    end if;
    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Per-tenant human-readable references, e.g. PM-WO-00042. Gap-free per tenant & kind.
create table public.tenant_counters (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  kind       text not null check (kind ~ '^[A-Z]{2,5}$'),
  next_value bigint not null default 1,
  primary key (tenant_id, kind)
);

create or replace function app.next_reference(p_tenant uuid, p_kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare v bigint; v_prefix text;
begin
  insert into public.tenant_counters as c (tenant_id, kind, next_value) values (p_tenant, p_kind, 2)
  on conflict (tenant_id, kind) do update set next_value = c.next_value + 1
  returning c.next_value - 1 into v;
  select reference_prefix into v_prefix from public.tenants where id = p_tenant;
  return coalesce(v_prefix, 'PM') || '-' || p_kind || '-' || lpad(v::text, 5, '0');
end $$;

create or replace function app.assign_reference() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.reference is null or btrim(new.reference) = '' then
      new.reference := app.next_reference(new.tenant_id, tg_argv[0]);
    end if;
  elsif new.reference is distinct from old.reference then
    raise exception 'reference cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

-- -------------------------------------------------------------------------------------
-- Audit log (append-only; written only by triggers / security definer functions)
-- -------------------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  tenant_id   uuid references public.tenants(id) on delete cascade,
  actor_id    uuid,
  actor_email text,
  action      text not null check (action in ('insert','update','delete','login','logout','export','invite','permission_change','approve','reject','ai_action','retention','system')),
  entity      text not null,
  entity_id   uuid,
  summary     text,
  changes     jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_tenant_time_idx on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (tenant_id, entity, entity_id);
comment on table public.audit_logs is 'Append-only audit trail. Personal data values are redacted (the fact of a change is kept, not the value).';

-- tg_argv: comma-separated list of columns whose VALUES must not be copied into the log.
create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb; v_new jsonb; v_changes jsonb; v_row jsonb;
  v_redact text[] := case when tg_nargs > 0 and tg_argv[0] <> '' then string_to_array(tg_argv[0], ',') else '{}'::text[] end;
  v_ignore text[] := array['updated_at','search_vector'];
begin
  if tg_op = 'INSERT' then
    v_row := to_jsonb(new);
    select jsonb_object_agg(key, case when key = any(v_redact) and value <> 'null'::jsonb then '"[redacted]"'::jsonb else value end)
      into v_changes from jsonb_each(v_row) where not key = any(v_ignore);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_row := v_new;
    select jsonb_object_agg(key,
             case when key = any(v_redact) then jsonb_build_object('changed', true)
                  else jsonb_build_object('from', v_old->key, 'to', value) end)
      into v_changes
      from jsonb_each(v_new)
      where (v_old->key) is distinct from value and not key = any(v_ignore);
    if v_changes is null then return new; end if;
  else
    v_row := to_jsonb(old);
    select jsonb_object_agg(key, case when key = any(v_redact) and value <> 'null'::jsonb then '"[redacted]"'::jsonb else value end)
      into v_changes from jsonb_each(v_row) where not key = any(v_ignore);
  end if;

  insert into public.audit_logs (tenant_id, actor_id, actor_email, action, entity, entity_id, summary, changes)
  values (
    nullif(v_row->>'tenant_id', '')::uuid,
    auth.uid(),
    nullif(auth.jwt()->>'email', ''),
    lower(tg_op),
    tg_table_name,
    case when v_row ? 'id' then nullif(v_row->>'id', '')::uuid end,
    coalesce(v_row->>'reference', v_row->>'name', v_row->>'title', v_row->>'key'),
    v_changes
  );
  return coalesce(new, old);
end $$;

-- Explicit audit events from application code (login, export, AI actions...).
create or replace function public.log_audit_event(p_tenant uuid, p_action text, p_entity text, p_entity_id uuid default null, p_summary text default null, p_details jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_tenant is not null and p_tenant not in (select app.member_tenants()) then
    raise exception 'not a member of this tenant' using errcode = '42501';
  end if;
  if p_action not in ('login','logout','export','ai_action','approve','reject') then
    raise exception 'action not allowed from clients' using errcode = '22023';
  end if;
  insert into public.audit_logs (tenant_id, actor_id, actor_email, action, entity, entity_id, summary, changes)
  values (p_tenant, auth.uid(), nullif(auth.jwt()->>'email',''), p_action, left(p_entity, 60), p_entity_id, left(p_summary, 300), p_details);
end $$;

-- -------------------------------------------------------------------------------------
-- Configurable picklists and the configurable job workflow
-- -------------------------------------------------------------------------------------
create table public.lookup_values (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  list       text not null check (list in ('trade','work_category','property_type','organisation_category','contract_type','document_category','skill','absence_type','cost_category','lead_source')),
  key        text not null check (key ~ '^[a-z0-9_]{1,60}$'),
  label      text not null check (length(btrim(label)) between 1 and 80),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, list, key),
  unique (tenant_id, id)
);

-- Validate lookup-driven columns. tg_argv: 'column=list' pairs.
create or replace function app.validate_lookups() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_pair text; v_col text; v_list text; v_val text; v_row jsonb := to_jsonb(new);
begin
  foreach v_pair in array tg_argv loop
    v_col := split_part(v_pair, '=', 1);
    v_list := split_part(v_pair, '=', 2);
    v_val := v_row->>v_col;
    if v_val is not null and not exists (
      select 1 from public.lookup_values l
      where l.tenant_id = new.tenant_id and l.list = v_list and l.key = v_val
    ) then
      raise exception '% "%" is not a configured % value', v_col, v_val, v_list using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;

create table public.job_statuses (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  key             text not null check (key ~ '^[a-z_]{2,40}$'),
  label           text not null check (length(btrim(label)) between 2 and 60),
  client_label    text check (length(client_label) <= 60),
  description     text not null default '',
  category        text not null check (category in ('intake','pre_works','ready','active','blocked','complete','closed')),
  colour          text not null default '#3b82f6' check (colour ~ '^#[0-9a-fA-F]{6}$'),
  sort_order      integer not null default 0,
  is_initial      boolean not null default false,
  is_terminal     boolean not null default false,
  counts_as_open  boolean not null default true,
  pauses_sla      boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, key),
  unique (tenant_id, id)
);
create unique index job_statuses_one_initial on public.job_statuses (tenant_id) where is_initial;

create table public.job_status_transitions (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  from_key            text not null,
  to_key              text not null,
  required_permission text references public.permissions(key),
  created_at          timestamptz not null default now(),
  created_by          uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, from_key, to_key),
  unique (tenant_id, id),
  check (from_key <> to_key),
  foreign key (tenant_id, from_key) references public.job_statuses(tenant_id, key) on delete cascade on update cascade,
  foreign key (tenant_id, to_key) references public.job_statuses(tenant_id, key) on delete cascade on update cascade
);

-- -------------------------------------------------------------------------------------
-- Membership integrity & privilege-escalation guards
-- -------------------------------------------------------------------------------------
create or replace function app.check_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_scope text; v_missing text;
begin
  select scope_type into v_scope from public.roles where id = new.role_id and tenant_id = new.tenant_id;
  if v_scope is null then raise exception 'role does not belong to this tenant' using errcode = '23503'; end if;

  -- the linked entity must match the role scope (and only that one may be set)
  if (v_scope = 'internal'      and num_nonnulls(new.organisation_id, new.employee_id, new.subcontractor_id, new.occupant_id) > 1)
  or (v_scope = 'client'        and (new.organisation_id is null  or num_nonnulls(new.employee_id, new.subcontractor_id, new.occupant_id) > 0))
  or (v_scope = 'operative'     and (new.employee_id is null      or num_nonnulls(new.organisation_id, new.subcontractor_id, new.occupant_id) > 0))
  or (v_scope = 'subcontractor' and (new.subcontractor_id is null or num_nonnulls(new.organisation_id, new.employee_id, new.occupant_id) > 0))
  or (v_scope = 'occupant'      and (new.occupant_id is null      or num_nonnulls(new.organisation_id, new.employee_id, new.subcontractor_id) > 0))
  then
    raise exception 'membership links do not match the % role scope', v_scope using errcode = '23514';
  end if;
  if v_scope = 'internal' and num_nonnulls(new.organisation_id, new.subcontractor_id, new.occupant_id) > 0 then
    raise exception 'internal staff may only be linked to an employee record' using errcode = '23514';
  end if;

  -- Checks below apply to end users acting through the API (not migrations/service role).
  if auth.uid() is not null and not app.is_platform_admin() then
    if new.user_id = auth.uid() and (tg_op = 'INSERT' or new.role_id is distinct from old.role_id or new.status is distinct from old.status) then
      raise exception 'you cannot change your own role or status' using errcode = '42501';
    end if;
    -- cannot hand out a role holding permissions you do not hold yourself
    select string_agg(rp.permission_key, ', ') into v_missing
    from public.role_permissions rp
    where rp.role_id = new.role_id
      and not app.has_perm(new.tenant_id, rp.permission_key);
    if v_missing is not null then
      raise exception 'you cannot assign a role with permissions you do not hold: %', v_missing using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create or replace function app.check_role_permission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_scope text; v_allowed text[]; v_role uuid := coalesce(new.role_id, old.role_id); v_tenant uuid := coalesce(new.tenant_id, old.tenant_id); v_perm text := coalesce(new.permission_key, old.permission_key);
begin
  if tg_op = 'INSERT' then
    select r.scope_type into v_scope from public.roles r where r.id = v_role;
    select p.scopes into v_allowed from public.permissions p where p.key = v_perm;
    if not (v_scope = any(v_allowed)) then
      raise exception 'permission % cannot be granted to a % role', v_perm, v_scope using errcode = '23514';
    end if;
  end if;
  if auth.uid() is not null and not app.is_platform_admin() then
    if not app.has_perm(v_tenant, v_perm) then
      raise exception 'you cannot grant or remove a permission you do not hold (%)', v_perm using errcode = '42501';
    end if;
    if exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.role_id = v_role) then
      raise exception 'you cannot change the permissions of your own role' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger memberships_check before insert or update on public.memberships
  for each row execute function app.check_membership();
create trigger role_permissions_check before insert or delete on public.role_permissions
  for each row execute function app.check_role_permission();

-- A tenant must always keep at least one active user who can manage users.
create or replace function app.keep_an_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := coalesce(old.tenant_id, new.tenant_id);
begin
  if exists (select 1 from public.tenants where id = v_tenant)  -- tenant itself not being deleted
     and not exists (
       select 1 from public.memberships m
       join public.role_permissions rp on rp.role_id = m.role_id and rp.permission_key = 'users.manage'
       join public.roles r on r.id = m.role_id and r.scope_type = 'internal'
       where m.tenant_id = v_tenant and m.status = 'active')
     and exists (select 1 from public.memberships where tenant_id = v_tenant)
  then
    raise exception 'the company must keep at least one active user who can manage users' using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger memberships_keep_admin after update or delete on public.memberships
  deferrable initially deferred for each row execute function app.keep_an_admin();
create constraint trigger role_permissions_keep_admin after delete on public.role_permissions
  deferrable initially deferred for each row execute function app.keep_an_admin();
