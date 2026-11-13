-- =====================================================================================
-- POWERMAC CONNECT - 0500 Documents, certificates, communications, notifications,
-- automation engine, intake (email/API), AI activity, integrations, data retention.
-- =====================================================================================

create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 255),
  category         text not null default 'other',
  storage_path     text not null check (storage_path ~ '^[0-9a-f-]{36}/'),
  mime_type        text check (length(mime_type) <= 120),
  size_bytes       bigint check (size_bytes between 0 and 104857600),
  organisation_id  uuid,
  contract_id      uuid,
  property_id      uuid,
  work_order_id    uuid,
  employee_id      uuid,
  subcontractor_id uuid,
  supplier_id      uuid,
  visibility       text not null default 'internal' check (visibility in ('internal','client','occupant')),
  expires_on       date,
  extracted        jsonb,
  extracted_at     timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id),
  unique (storage_path),
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete cascade,
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete cascade,
  foreign key (tenant_id, property_id) references public.properties(tenant_id, id) on delete cascade,
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete cascade,
  foreign key (tenant_id, subcontractor_id) references public.subcontractors(tenant_id, id) on delete cascade,
  foreign key (tenant_id, supplier_id) references public.suppliers(tenant_id, id) on delete cascade
);
create index documents_links_idx on public.documents (tenant_id, organisation_id, contract_id, property_id, work_order_id);
create index documents_expiry_idx on public.documents (tenant_id, expires_on) where expires_on is not null;
comment on column public.documents.extracted is 'AI document-intelligence output (suggestions only until a person confirms them).';

alter table public.qualifications add foreign key (tenant_id, document_id) references public.documents(tenant_id, id) on delete set null (document_id);
alter table public.supplier_quotes add foreign key (tenant_id, document_id) references public.documents(tenant_id, id) on delete set null (document_id);

create table public.certificates (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  reference     text not null,
  type          text not null check (type in ('gas_safety','eicr','pat','fensa','building_control','asbestos','fire_risk','legionella','completion','warranty','other')),
  property_id   uuid not null,
  work_order_id uuid,
  document_id   uuid,
  issued_on     date not null,
  expires_on    date,
  issued_by     text check (length(issued_by) <= 160),
  result        text check (result in ('satisfactory','unsatisfactory','advisory')),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  check (expires_on is null or expires_on >= issued_on),
  foreign key (tenant_id, property_id) references public.properties(tenant_id, id) on delete cascade,
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete set null (work_order_id),
  foreign key (tenant_id, document_id) references public.documents(tenant_id, id) on delete set null (document_id)
);
create index certificates_expiry_idx on public.certificates (tenant_id, expires_on);

create table public.communications (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  channel         text not null check (channel in ('email','sms','whatsapp','phone','portal','letter')),
  direction       text not null check (direction in ('inbound','outbound')),
  organisation_id uuid,
  contact_id      uuid,
  occupant_id     uuid,
  work_order_id   uuid,
  subject         text check (length(subject) <= 300),
  body            text check (length(body) <= 50000),
  from_address    text check (length(from_address) <= 320),
  to_address      text check (length(to_address) <= 320),
  status          text not null default 'draft' check (status in ('draft','queued','sent','delivered','failed','received','preview')),
  provider        text,
  external_id     text,
  error           text,
  sent_at         timestamptz,
  thread_key      text,
  visibility      text not null default 'internal' check (visibility in ('internal','client','occupant')),
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete set null (organisation_id),
  foreign key (tenant_id, contact_id) references public.contacts(tenant_id, id) on delete set null (contact_id),
  foreign key (tenant_id, occupant_id) references public.occupants(tenant_id, id) on delete set null (occupant_id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete set null (work_order_id)
);
create index communications_org_idx on public.communications (tenant_id, organisation_id, created_at desc);
create index communications_wo_idx on public.communications (tenant_id, work_order_id, created_at desc);
comment on column public.communications.status is 'preview = provider not configured; message stored and shown, nothing was sent.';

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null check (length(type) <= 60),
  severity   text not null default 'info' check (severity in ('info','success','warning','critical')),
  title      text not null check (length(title) <= 200),
  body       text check (length(body) <= 2000),
  link       text check (link ~ '^/[^/]'),
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc) where read_at is null;

-- -------------------------------------------------------------------------------------
-- Automation engine (rules are data; the runner lives in server code, Stage 6)
-- -------------------------------------------------------------------------------------
create table public.automation_workflows (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  name              text not null check (length(btrim(name)) between 2 and 160),
  description       text check (length(description) <= 2000),
  trigger_type      text not null check (trigger_type in ('event','schedule')),
  trigger_event     text check (trigger_event in ('work_request.received','work_order.created','work_order.status_changed','work_order.overdue','work_order.completed','contract.expiring','certificate.expiring','qualification.expiring','stock.below_reorder','invoice.overdue','quotation.sent')),
  schedule_cron     text check (length(schedule_cron) <= 60),
  conditions        jsonb not null default '[]'::jsonb check (jsonb_typeof(conditions) = 'array'),
  actions           jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  is_active         boolean not null default false,
  requires_approval boolean not null default true,
  last_run_at       timestamptz,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  check ((trigger_type = 'event') = (trigger_event is not null)),
  check ((trigger_type = 'schedule') = (schedule_cron is not null))
);

create table public.automation_runs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  workflow_id  uuid not null,
  status       text not null default 'pending' check (status in ('pending','awaiting_approval','running','succeeded','failed','skipped','rejected')),
  trigger_ref  text,
  input        jsonb not null default '{}'::jsonb,
  output       jsonb,
  error        text,
  approved_by  uuid references public.profiles(id) on delete set null,
  approved_at  timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, workflow_id) references public.automation_workflows(tenant_id, id) on delete cascade
);
create index automation_runs_wf_idx on public.automation_runs (tenant_id, workflow_id, created_at desc);

-- -------------------------------------------------------------------------------------
-- Work-request intake (authorised email senders, API keys) - processed into draft jobs
-- -------------------------------------------------------------------------------------
create table public.intake_senders (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  organisation_id uuid not null,
  email_pattern   text not null check (email_pattern ~* '^(\*@)?[^@\s]*@?[^@\s]+\.[^@\s]+$'),
  default_contract_id uuid,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, email_pattern),
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete cascade,
  foreign key (tenant_id, default_contract_id) references public.contracts(tenant_id, id) on delete set null (default_contract_id)
);
comment on table public.intake_senders is 'Only mail from these senders (exact address or *@domain) can become a draft work order.';

create table public.api_keys (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 2 and 120),
  prefix          text not null check (prefix ~ '^pmc_[a-z0-9]{8}$'),
  key_hash        text not null,
  organisation_id uuid,
  scopes          text[] not null default '{work_requests.create}',
  last_used_at    timestamptz,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  unique (prefix),
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete cascade
);
comment on column public.api_keys.key_hash is 'SHA-256 of the secret. The secret itself is shown once and never stored.';

create table public.inbound_messages (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  channel            text not null check (channel in ('email','api','whatsapp','portal')),
  sender             text not null check (length(sender) <= 320),
  subject            text check (length(subject) <= 500),
  body               text check (length(body) <= 100000),
  received_at        timestamptz not null default now(),
  organisation_id    uuid,
  is_authorised      boolean not null default false,
  status             text not null default 'new' check (status in ('new','processing','draft_created','needs_info','rejected','duplicate','failed')),
  extracted          jsonb,
  work_order_id      uuid,
  processed_by       uuid references public.profiles(id) on delete set null,
  processed_at       timestamptz,
  external_id        text,
  created_at         timestamptz not null default now(),
  created_by         uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, channel, external_id),
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete set null (organisation_id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete set null (work_order_id)
);
create index inbound_messages_status_idx on public.inbound_messages (tenant_id, status, received_at desc);

-- -------------------------------------------------------------------------------------
-- AI activity log: every AI call, its output, and the human decision on it.
-- -------------------------------------------------------------------------------------
create table public.ai_activity (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  user_id        uuid references public.profiles(id) on delete set null default auth.uid(),
  feature        text not null check (feature in ('email_to_job','classification','scheduling','quotation','document','reporting','assistant')),
  provider       text not null default 'openai',
  model          text,
  input_summary  text check (length(input_summary) <= 2000),
  entity         text,
  entity_id      uuid,
  output         jsonb,
  status         text not null default 'completed' check (status in ('completed','failed','pending_approval','approved','rejected','applied')),
  tokens_in      integer,
  tokens_out     integer,
  latency_ms     integer,
  decided_by     uuid references public.profiles(id) on delete set null,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, id)
);
create index ai_activity_tenant_idx on public.ai_activity (tenant_id, created_at desc);

-- -------------------------------------------------------------------------------------
-- Integrations (non-secret config only; secrets live in server env / vault)
-- -------------------------------------------------------------------------------------
create table public.integrations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  provider      text not null check (provider in ('xero','quickbooks','sage','resend','twilio','whatsapp','google_maps','openai','anthropic','microsoft_365','gmail','companies_house','os_places')),
  status        text not null default 'not_configured' check (status in ('not_configured','connected','error','disabled')),
  config        jsonb not null default '{}'::jsonb,
  connected_at  timestamptz,
  last_sync_at  timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, provider)
);

-- -------------------------------------------------------------------------------------
-- Data retention (UK GDPR storage limitation). Applied by app.apply_retention() (0600).
-- -------------------------------------------------------------------------------------
create table public.retention_policies (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  entity        text not null check (entity in ('former_occupants','ai_activity','audit_logs','communications','inbound_messages','notifications','automation_runs')),
  retain_months integer not null check (retain_months between 1 and 240),
  action        text not null default 'delete' check (action in ('delete','anonymise')),
  is_active     boolean not null default true,
  last_applied_at timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, entity)
);
