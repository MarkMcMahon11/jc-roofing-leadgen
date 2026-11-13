-- =====================================================================================
-- POWERMAC CONNECT - 0600 Security & provisioning
--   * Row Level Security on EVERY public table (default deny)
--   * One registry drives the standard policies + triggers for business tables, so every
--     table follows the same, testable rule:  internal staff of tenant T holding permission P
--   * External users (clients, operatives, subcontractors, occupants) never read base tables;
--     they get narrow SECURITY DEFINER functions with explicit column lists (Stage 4).
--   * Column-level grants stop users editing plan/billing/admin columns.
--   * Tenant provisioning: default roles, workflow, picklists, retention, automations.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Registry of tenant-scoped business tables
-- -------------------------------------------------------------------------------------
create table app.table_registry (
  tbl          text primary key,
  read_perm    text,          -- null: no generic select policy
  write_perm   text,          -- null: no generic insert/update policy
  delete_perm  text,          -- null: no generic delete policy
  ref_kind     text,          -- reference prefix kind, e.g. WO -> PM-WO-00001
  redact       text default '',-- audit log: record THAT these changed, never their values
  lookups      text[] default '{}',
  base_columns boolean default true  -- has id/created_at/created_by/updated_at
);

insert into app.table_registry (tbl, read_perm, write_perm, delete_perm, ref_kind, redact, lookups, base_columns) values
  ('organisations',              'crm.read',            'crm.write',            'crm.delete',          'ORG', '', '{category=organisation_category}', true),
  ('contacts',                   'crm.read',            'crm.write',            'crm.write',           null,  'email,phone,mobile', '{}', true),
  ('crm_opportunities',          'crm.read',            'crm.write',            'crm.delete',          'OPP', '', '{}', true),
  ('crm_activities',             'crm.read',            'crm.write',            'crm.write',           null,  '', '{}', true),
  ('contracts',                  'contracts.read',      'contracts.write',      'contracts.delete',    'CON', '', '{contract_type=contract_type}', true),
  ('contract_slas',              'contracts.read',      'contracts.write',      'contracts.write',     null,  '', '{}', true),
  ('contract_kpis',              'contracts.read',      'contracts.write',      'contracts.write',     null,  '', '{}', true),
  ('contract_variations',        'contracts.read',      'contracts.write',      'contracts.delete',    'VAR', '', '{}', true),
  ('contract_properties',        'contracts.read',      'contracts.write',      'contracts.write',     null,  '', '{}', false),
  ('properties',                 'properties.read',     'properties.write',     'properties.delete',   'PRP', 'key_safe_info', '{property_type=property_type}', true),
  ('occupants',                  'occupants.read',      'occupants.write',      'occupants.write',     null,  'full_name,phone,email,access_needs,vulnerability_flags', '{}', true),
  ('vehicles',                   'workforce.read',      'workforce.write',      'workforce.write',     null,  '', '{}', true),
  ('employees',                  'workforce.read',      'workforce.write',      'workforce.write',     'EMP', '', '{trade=trade}', true),
  ('employee_private',           'workforce.pii',       'workforce.pii',        'workforce.pii',       null,  'date_of_birth,ni_number,home_address,personal_phone,emergency_contact_name,emergency_contact_phone,hourly_cost,notes', '{}', true),
  ('employee_absences',          'workforce.read',      'workforce.write',      'workforce.write',     null,  'notes', '{type=absence_type}', true),
  ('subcontractors',             'subcontractors.read', 'subcontractors.write', 'subcontractors.write','SUB', '', '{}', true),
  ('qualifications',             'workforce.read',      'workforce.write',      'workforce.write',     null,  '', '{}', true),
  ('projects',                   'projects.read',       'projects.write',       'projects.write',      'PRJ', '', '{}', true),
  ('project_milestones',         'projects.read',       'projects.write',       'projects.write',      null,  '', '{}', true),
  ('work_orders',                'work_orders.read',    'work_orders.write',    'work_orders.delete',  'WO',  'signoff_signature_path', '{trade=trade,work_category=work_category}', true),
  ('job_assignments',            'work_orders.read',    'work_orders.assign',   'work_orders.assign',  null,  '', '{}', true),
  ('job_updates',                'work_orders.read',    'work_orders.write',    'work_orders.delete',  null,  '', '{}', true),
  ('photos',                     'work_orders.read',    'work_orders.write',    'work_orders.write',   null,  '', '{}', true),
  ('checklist_templates',        'work_orders.read',    'settings.manage',      'settings.manage',     null,  '', '{}', true),
  ('job_checklists',             'work_orders.read',    'work_orders.write',    'work_orders.write',   null,  '', '{}', true),
  ('inspections',                'work_orders.read',    'work_orders.write',    'work_orders.write',   'INS', '', '{}', true),
  ('timesheets',                 'workforce.read',      'workforce.write',      'workforce.write',     null,  '', '{}', true),
  ('suppliers',                  'suppliers.read',      'suppliers.write',      'suppliers.write',     'SUP', '', '{}', true),
  ('materials',                  'inventory.read',      'inventory.write',      'inventory.write',     null,  '', '{}', true),
  ('supplier_prices',            'suppliers.read',      'suppliers.write',      'suppliers.write',     null,  '', '{}', true),
  ('stock_locations',            'inventory.read',      'inventory.write',      'inventory.write',     null,  '', '{}', true),
  ('stock_levels',               'inventory.read',      null,                   null,                  null,  '', '{}', false),
  ('stock_movements',            'inventory.read',      null,                   null,                  null,  '', '{}', true),
  ('purchase_requisitions',      'procurement.read',    'procurement.write',    'procurement.write',   'REQ', '', '{}', true),
  ('purchase_requisition_lines', 'procurement.read',    'procurement.write',    'procurement.write',   null,  '', '{}', true),
  ('supplier_quotes',            'procurement.read',    'procurement.write',    'procurement.write',   null,  '', '{}', true),
  ('purchase_orders',            'procurement.read',    'procurement.write',    'procurement.write',   'PO',  '', '{}', true),
  ('purchase_order_lines',       'procurement.read',    'procurement.write',    'procurement.write',   null,  '', '{}', true),
  ('goods_receipts',             'procurement.read',    'procurement.write',    'procurement.write',   null,  '', '{}', true),
  ('goods_receipt_lines',        'procurement.read',    'procurement.write',    'procurement.write',   null,  '', '{}', true),
  ('job_materials',              'work_orders.read',    'work_orders.write',    'work_orders.write',   null,  '', '{}', true),
  ('rate_cards',                 'quotes.read',         'quotes.write',         'quotes.write',        null,  '', '{}', true),
  ('rate_card_items',            'quotes.read',         'quotes.write',         'quotes.write',        null,  '', '{}', true),
  ('quotations',                 'quotes.read',         'quotes.write',         'quotes.write',        'QUO', '', '{}', true),
  ('quotation_lines',            'quotes.read',         'quotes.write',         'quotes.write',        null,  '', '{}', true),
  ('invoices',                   'finance.read',        'finance.write',        'finance.write',       'INV', '', '{}', true),
  ('invoice_lines',              'finance.read',        'finance.write',        'finance.write',       null,  '', '{}', true),
  ('payments',                   'finance.read',        'finance.write',        'finance.write',       null,  '', '{}', true),
  ('costs',                      'finance.read',        'finance.write',        'finance.write',       null,  '', '{}', true),
  ('documents',                  'documents.read',      'documents.write',      'documents.delete',    null,  '', '{category=document_category}', true),
  ('certificates',               'properties.read',     'documents.write',      'documents.delete',    'CRT', '', '{}', true),
  ('communications',             'communications.read', 'communications.write', 'communications.write',null,  'body,from_address,to_address', '{}', true),
  ('automation_workflows',       'automations.read',    'automations.manage',   'automations.manage',  null,  '', '{}', true),
  ('automation_runs',            'automations.read',    'automations.manage',   'automations.manage',  null,  'input,output', '{}', true),
  ('intake_senders',             'settings.manage',     'settings.manage',      'settings.manage',     null,  '', '{}', true),
  ('api_keys',                   'settings.manage',     'settings.manage',      'settings.manage',     null,  'key_hash', '{}', true),
  ('inbound_messages',           'work_orders.read',    'work_orders.write',    'work_orders.delete',  null,  'body,sender', '{}', true),
  ('integrations',               'settings.manage',     'settings.manage',      'settings.manage',     null,  'config', '{}', true),
  ('retention_policies',         'settings.manage',     'settings.manage',      'settings.manage',     null,  '', '{}', true),
  ('lookup_values',              null,                  'settings.manage',      'settings.manage',     null,  '', '{}', true),
  ('job_statuses',               null,                  'settings.manage',      'settings.manage',     null,  '', '{}', true),
  ('job_status_transitions',     null,                  'settings.manage',      'settings.manage',     null,  '', '{}', true),
  ('roles',                      null,                  'users.manage',         'users.manage',        null,  '', '{}', true),
  ('role_permissions',           null,                  'users.manage',         'users.manage',        null,  '', '{}', false),
  ('memberships',                null,                  'users.manage',         'users.manage',        null,  '', '{}', true);

-- -------------------------------------------------------------------------------------
-- Tenant-level platform columns: only platform admins may change plan/billing columns
-- (column grants already block end users; this keeps updated_at for tenants)
-- -------------------------------------------------------------------------------------
create or replace function app.touch_row_platform() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.id := old.id; new.created_at := old.created_at; new.updated_at := now();
  return new;
end $$;

-- -------------------------------------------------------------------------------------
-- Apply standard policies & triggers from the registry
-- -------------------------------------------------------------------------------------
do $$
declare r app.table_registry; v_args text;
begin
  for r in select * from app.table_registry loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('alter table public.%I force row level security', r.tbl);

    if r.read_perm is not null then
      execute format($p$create policy %I on public.%I for select to authenticated
        using (tenant_id in (select app.internal_perm_tenants(%L)))$p$, r.tbl || '_select', r.tbl, r.read_perm);
    end if;
    if r.write_perm is not null then
      execute format($p$create policy %I on public.%I for insert to authenticated
        with check (tenant_id in (select app.internal_perm_tenants(%L)))$p$, r.tbl || '_insert', r.tbl, r.write_perm);
      if r.tbl not in ('role_permissions') then
        execute format($p$create policy %I on public.%I for update to authenticated
          using (tenant_id in (select app.internal_perm_tenants(%L)))
          with check (tenant_id in (select app.internal_perm_tenants(%L)))$p$, r.tbl || '_update', r.tbl, r.write_perm, r.write_perm);
      end if;
    end if;
    if r.delete_perm is not null then
      execute format($p$create policy %I on public.%I for delete to authenticated
        using (tenant_id in (select app.internal_perm_tenants(%L)))$p$, r.tbl || '_delete', r.tbl, r.delete_perm);
    end if;

    if r.base_columns then
      execute format('create trigger %I before insert or update on public.%I for each row execute function app.touch_row()', r.tbl || '_touch', r.tbl);
    end if;
    if r.ref_kind is not null then
      execute format('create trigger %I before insert or update of reference on public.%I for each row execute function app.assign_reference(%L)', r.tbl || '_reference', r.tbl, r.ref_kind);
    end if;
    if array_length(r.lookups, 1) > 0 then
      select string_agg(quote_literal(x), ',') into v_args from unnest(r.lookups) x;
      execute format('create trigger %I before insert or update on public.%I for each row execute function app.validate_lookups(%s)', r.tbl || '_lookups', r.tbl, v_args);
    end if;
    if r.tbl not in ('stock_levels') then
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row(%L)', r.tbl || '_audit', r.tbl, r.redact);
    end if;
  end loop;
end $$;

-- Configuration readable by every member of the tenant (labels, roles for display)
create policy lookup_values_member_select on public.lookup_values for select to authenticated using (tenant_id in (select app.member_tenants()));
create policy job_statuses_member_select on public.job_statuses for select to authenticated using (tenant_id in (select app.member_tenants()));
create policy job_status_transitions_member_select on public.job_status_transitions for select to authenticated using (tenant_id in (select app.member_tenants()));
create policy roles_member_select on public.roles for select to authenticated using (tenant_id in (select app.member_tenants()));
create policy role_permissions_member_select on public.role_permissions for select to authenticated using (tenant_id in (select app.member_tenants()));

-- Memberships: your own, or all in tenants where you manage users; platform admins all.
create policy memberships_select on public.memberships for select to authenticated using (
  user_id = (select auth.uid())
  or tenant_id in (select app.internal_perm_tenants('users.manage'))
  or (select app.is_platform_admin())
);
create policy memberships_platform_write on public.memberships for all to authenticated
  using ((select app.is_platform_admin())) with check ((select app.is_platform_admin()));

-- Stock ledger is append-only (corrections are new 'adjustment' movements)
create policy stock_movements_insert on public.stock_movements for insert to authenticated
  with check (tenant_id in (select app.internal_perm_tenants('inventory.write')));

-- AI activity: your own entries; audit viewers see all in the tenant.
alter table public.ai_activity enable row level security;
alter table public.ai_activity force row level security;
create policy ai_activity_select on public.ai_activity for select to authenticated using (
  (user_id = (select auth.uid()) and tenant_id in (select app.internal_perm_tenants('ai.use')))
  or tenant_id in (select app.internal_perm_tenants('audit.view'))
);
create policy ai_activity_insert on public.ai_activity for insert to authenticated with check (
  user_id = (select auth.uid()) and tenant_id in (select app.internal_perm_tenants('ai.use'))
);
create policy ai_activity_update on public.ai_activity for update to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select app.internal_perm_tenants('ai.use')))
  with check (user_id = (select auth.uid()) and tenant_id in (select app.internal_perm_tenants('ai.use')));
create trigger ai_activity_touch before insert or update on public.ai_activity for each row execute function app.touch_row();

-- Notifications: strictly your own.
alter table public.notifications enable row level security;
alter table public.notifications force row level security;
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()) and tenant_id in (select app.member_tenants()));
create policy notifications_update on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));
create trigger notifications_touch before insert or update on public.notifications for each row execute function app.touch_row();

-- Platform tables
alter table public.plans enable row level security;
create policy plans_select on public.plans for select to authenticated using (true);
create policy plans_platform_write on public.plans for all to authenticated using ((select app.is_platform_admin())) with check ((select app.is_platform_admin()));

alter table public.permissions enable row level security;
create policy permissions_select on public.permissions for select to authenticated using (true);

alter table public.tenants enable row level security;
alter table public.tenants force row level security;
create policy tenants_select on public.tenants for select to authenticated using (id in (select app.member_tenants()) or (select app.is_platform_admin()));
create policy tenants_update on public.tenants for update to authenticated
  using (id in (select app.internal_perm_tenants('settings.manage')) or (select app.is_platform_admin()))
  with check (id in (select app.internal_perm_tenants('settings.manage')) or (select app.is_platform_admin()));
create trigger tenants_touch before update on public.tenants for each row execute function app.touch_row_platform();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid()) or (select app.is_platform_admin()) or app.shares_tenant_with(id)
);
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
create policy audit_logs_select on public.audit_logs for select to authenticated using (
  tenant_id in (select app.internal_perm_tenants('audit.view'))
  or (tenant_id is null and (select app.is_platform_admin()))
);

alter table public.tenant_counters enable row level security;
alter table public.tenant_counters force row level security;
-- no policies: only security definer functions touch counters

-- -------------------------------------------------------------------------------------
-- Grants: no anonymous access at all; column-level limits on platform/identity tables
-- -------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, phone, last_tenant_id, last_seen_at) on public.profiles to authenticated;

revoke insert, update, delete on public.tenants from authenticated;
grant update (name, legal_name, company_number, vat_number, reference_prefix, timezone, brand_colour, default_vat_rate, settings) on public.tenants to authenticated;

revoke insert, update, delete, truncate on public.audit_logs from authenticated;
revoke all on public.tenant_counters from authenticated;
revoke insert, update, delete on public.permissions from authenticated;
revoke truncate on all tables in schema public from authenticated;

-- Derived/financial columns are never written directly by users
revoke update on public.invoices from authenticated;
grant update (organisation_id, contract_id, work_order_id, quotation_id, status, issue_date, due_date, retention_amount, purchase_order_ref, notes, external_system, external_ref, synced_at) on public.invoices to authenticated;
revoke update on public.quotations from authenticated;
grant update (organisation_id, contract_id, property_id, work_order_id, title, status, version, valid_until, intro, terms, sent_at, decided_by_name, rejection_reason, ai_generated) on public.quotations to authenticated;
revoke update on public.purchase_orders from authenticated;
grant update (supplier_id, requisition_id, work_order_id, contract_id, status, order_date, expected_date, delivery_property_id, delivery_location_id, delivery_address, delivery_notes, supplier_invoice_ref, sent_at, notes, external_ref) on public.purchase_orders to authenticated;
revoke update on public.timesheets from authenticated;
grant update (employee_id, work_order_id, work_date, started_at, ended_at, hours, break_minutes, entry_type, status, notes) on public.timesheets to authenticated;
-- approval/derived columns on jobs are set by triggers, never typed in
revoke update on public.work_orders from authenticated;
grant update (client_reference, organisation_id, contract_id, property_id, project_id, parent_id, occupant_id, title, description, work_category, trade,
  priority, status, source, reported_at, target_attend_at, target_completion_at, estimated_hours, scheduled_start, scheduled_end, actual_start, actual_end,
  estimated_cost, not_to_exceed, requires_approval, access_notes, completion_notes, signoff_name, signoff_at, signoff_signature_path, satisfaction_score,
  first_time_fix, manager_id, tags) on public.work_orders to authenticated;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- Approvals must be made by someone allowed to approve (cannot be self-asserted)
-- -------------------------------------------------------------------------------------
create or replace function app.guard_approvals() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_perm text; v_flag boolean;
begin
  if auth.uid() is null then return new; end if;  -- service role / migrations
  if tg_table_name = 'purchase_orders' then
    v_perm := 'procurement.approve';
    v_flag := new.status in ('approved','sent','part_received','received','invoiced') and (tg_op = 'INSERT' or old.status in ('draft','pending_approval'));
    if v_flag then new.approved_by := auth.uid(); new.approved_at := coalesce(new.approved_at, now()); end if;
  elsif tg_table_name = 'purchase_requisitions' then
    v_perm := 'procurement.approve';
    v_flag := new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved');
    if v_flag then new.approved_by := auth.uid(); new.approved_at := now(); end if;
  elsif tg_table_name = 'contract_variations' then
    v_perm := 'contracts.approve';
    v_flag := new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved');
    if v_flag then new.approved_by := auth.uid(); new.approved_at := now(); end if;
  elsif tg_table_name = 'quotations' then
    v_perm := 'quotes.approve';
    v_flag := new.status in ('approved','rejected') and (tg_op = 'INSERT' or old.status is distinct from new.status);
    if v_flag then new.decided_by_user := auth.uid(); new.decided_at := now(); end if;
  elsif tg_table_name = 'timesheets' then
    v_perm := 'workforce.write';
    v_flag := new.status in ('approved','rejected') and (tg_op = 'INSERT' or old.status is distinct from new.status);
    if v_flag then new.approved_by := auth.uid(); new.approved_at := now(); end if;
  end if;
  if v_flag and not app.has_perm(new.tenant_id, v_perm) then
    raise exception 'approval requires the % permission', v_perm using errcode = '42501';
  end if;
  return new;
end $$;
create trigger purchase_orders_approval before insert or update of status on public.purchase_orders for each row execute function app.guard_approvals();
create trigger purchase_requisitions_approval before insert or update of status on public.purchase_requisitions for each row execute function app.guard_approvals();
create trigger contract_variations_approval before insert or update of status on public.contract_variations for each row execute function app.guard_approvals();
create trigger quotations_approval before insert or update of status on public.quotations for each row execute function app.guard_approvals();
create trigger timesheets_approval before insert or update of status on public.timesheets for each row execute function app.guard_approvals();

-- -------------------------------------------------------------------------------------
-- Job workflow enforcement + automatic job history
-- -------------------------------------------------------------------------------------
create or replace function app.work_order_status_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_perm text; v_found boolean; v_cat text;
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.approved_at := null; new.approved_by := null; new.completed_at := null; new.closed_at := null;
    if not exists (select 1 from public.job_statuses s where s.tenant_id = new.tenant_id and s.key = new.status and s.category in ('intake','pre_works')) then
      raise exception 'new jobs start in an intake or pre-works status; move them on through the workflow' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if auth.uid() is not null then
      select true, t.required_permission into v_found, v_perm
      from public.job_status_transitions t
      where t.tenant_id = new.tenant_id and t.from_key = old.status and t.to_key = new.status;
      if v_found is null then
        raise exception 'moving a job from "%" to "%" is not allowed by the workflow', old.status, new.status using errcode = '23514';
      end if;
      if v_perm is not null and not app.has_perm(new.tenant_id, v_perm) then
        raise exception 'this status change requires the % permission', v_perm using errcode = '42501';
      end if;
    end if;
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    select category into v_cat from public.job_statuses where tenant_id = new.tenant_id and key = new.status;
    if new.status = 'approved' and new.approved_at is null then new.approved_at := now(); new.approved_by := auth.uid(); end if;
    if v_cat in ('complete','closed') and new.completed_at is null and new.status <> 'cancelled' then new.completed_at := now(); end if;
    if v_cat = 'closed' and new.closed_at is null then new.closed_at := now(); end if;
    if v_cat in ('intake','pre_works','ready','active','blocked') then new.closed_at := null; end if;
    if v_cat in ('intake','pre_works','ready','active','blocked') and tg_op = 'UPDATE' then new.completed_at := null; end if;
  end if;
  return new;
end $$;
create trigger work_orders_status_guard before insert or update of status on public.work_orders
  for each row execute function app.work_order_status_guard();

create or replace function app.work_order_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.job_updates (tenant_id, work_order_id, author_id, type, to_status, body, visibility, created_by)
    values (new.tenant_id, new.id, auth.uid(), 'created', new.status, 'Job created (' || new.source || ')', 'client', auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.job_updates (tenant_id, work_order_id, author_id, type, from_status, to_status, visibility, created_by)
    values (new.tenant_id, new.id, auth.uid(), 'status_change', old.status, new.status, 'client', auth.uid());
  end if;
  return null;
end $$;
create trigger work_orders_history after insert or update of status on public.work_orders
  for each row execute function app.work_order_history();

-- Assignment history + keep the job's scheduled window in step with its assignments
create or replace function app.assignment_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_wo uuid := coalesce(new.work_order_id, old.work_order_id); v_t uuid := coalesce(new.tenant_id, old.tenant_id);
begin
  update public.work_orders w set
    scheduled_start = s.mn, scheduled_end = s.mx
  from (select min(scheduled_start) mn, max(scheduled_end) mx from public.job_assignments where work_order_id = v_wo and status <> 'cancelled') s
  where w.id = v_wo;
  if tg_op = 'INSERT' then
    insert into public.job_updates (tenant_id, work_order_id, author_id, type, body, data, created_by)
    values (v_t, v_wo, auth.uid(), 'assignment', 'Assigned', jsonb_build_object('assignment_id', new.id, 'employee_id', new.employee_id, 'subcontractor_id', new.subcontractor_id, 'start', new.scheduled_start, 'end', new.scheduled_end), auth.uid());
  end if;
  return null;
end $$;
create trigger job_assignments_sync after insert or update or delete on public.job_assignments
  for each row execute function app.assignment_sync();

-- -------------------------------------------------------------------------------------
-- Tenant provisioning: everything a new company needs to start
-- -------------------------------------------------------------------------------------
create or replace function app.provision_tenant() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; v_role uuid;
begin
  -- Roles (configurable afterwards; is_system marks the defaults)
  for r in select * from (values
    ('director',           'Company Director',     'internal',      'Full visibility of operations and financial performance', null::text[]),
    ('operations_manager', 'Operations Manager',   'internal',      'Work orders, workforce, schedules, projects and delivery',
       array['dashboard.view','crm.read','contracts.read','properties.read','properties.write','occupants.read','occupants.write','work_orders.read','work_orders.write','work_orders.delete','work_orders.assign','work_orders.approve','projects.read','projects.write','schedule.read','schedule.write','workforce.read','workforce.write','subcontractors.read','subcontractors.write','suppliers.read','procurement.read','procurement.write','inventory.read','inventory.write','quotes.read','quotes.write','documents.read','documents.write','communications.read','communications.write','ai.use','automations.read','reports.view']),
    ('contract_manager',   'Contract Manager',     'internal',      'Contracts, client relationships, performance and approvals',
       array['dashboard.view','crm.read','crm.write','contracts.read','contracts.write','contracts.approve','properties.read','properties.write','occupants.read','work_orders.read','work_orders.write','work_orders.approve','projects.read','schedule.read','quotes.read','quotes.write','quotes.approve','finance.read','documents.read','documents.write','communications.read','communications.write','ai.use','reports.view']),
    ('office_admin',       'Office Administrator', 'internal',      'Enquiries, work orders, documents and administration',
       array['dashboard.view','crm.read','crm.write','contracts.read','properties.read','properties.write','occupants.read','occupants.write','work_orders.read','work_orders.write','work_orders.assign','schedule.read','schedule.write','workforce.read','subcontractors.read','suppliers.read','procurement.read','procurement.write','inventory.read','quotes.read','documents.read','documents.write','communications.read','communications.write','ai.use']),
    ('finance_manager',    'Finance Manager',      'internal',      'Costs, invoices, payments and financial reporting',
       array['dashboard.view','crm.read','contracts.read','properties.read','work_orders.read','projects.read','workforce.read','workforce.pii','subcontractors.read','suppliers.read','suppliers.write','procurement.read','procurement.write','procurement.approve','inventory.read','quotes.read','finance.read','finance.write','documents.read','documents.write','reports.view','ai.use','audit.view']),
    ('field_operative',    'Field Operative',      'operative',     'Assigned jobs and work updates on site',
       array['work_orders.read','field.update','properties.read','occupants.read','documents.read','schedule.read']),
    ('subcontractor',      'Subcontractor',        'subcontractor', 'Authorised assignments only',
       array['work_orders.read','field.update','properties.read','occupants.read','documents.read']),
    ('client_user',        'Corporate Client',     'client',        'Own contracts, properties, work requests and reports',
       array['contracts.read','properties.read','work_orders.read','portal.request','quotes.read','quotes.approve','finance.read','documents.read','documents.write','communications.read','communications.write','reports.view']),
    ('occupant',           'Tenant / Occupant',    'occupant',      'Own repair information and communications (when enabled)',
       array['work_orders.read','portal.request','communications.read','communications.write'])
  ) as t(key, name, scope, descr, perms) loop
    insert into public.roles (tenant_id, key, name, description, scope_type, is_system, created_by)
    values (new.id, r.key, r.name, r.descr, r.scope, true, null) returning id into v_role;
    insert into public.role_permissions (tenant_id, role_id, permission_key)
    select new.id, v_role, p.key from public.permissions p
    where (r.perms is null and 'internal' = any(p.scopes)) or p.key = any(r.perms);
  end loop;

  -- Default job workflow (13 standard statuses + cancelled)
  insert into public.job_statuses (tenant_id, key, label, client_label, category, colour, sort_order, is_initial, is_terminal, counts_as_open, pauses_sla, created_by) values
    (new.id, 'new',                 'New',                 'Received',               'intake',    '#60a5fa', 10,  true,  false, true,  false, null),
    (new.id, 'under_review',        'Under review',        'Being reviewed',         'intake',    '#818cf8', 20,  false, false, true,  false, null),
    (new.id, 'awaiting_survey',     'Awaiting survey',     'Survey to be arranged',  'pre_works', '#a78bfa', 30,  false, false, true,  false, null),
    (new.id, 'awaiting_quotation',  'Awaiting quotation',  'Being priced',           'pre_works', '#c084fc', 40,  false, false, true,  false, null),
    (new.id, 'awaiting_approval',   'Awaiting approval',   'Awaiting your approval', 'pre_works', '#f472b6', 50,  false, false, true,  true,  null),
    (new.id, 'approved',            'Approved',            'Approved',               'ready',     '#2dd4bf', 60,  false, false, true,  false, null),
    (new.id, 'scheduled',           'Scheduled',           'Booked in',              'ready',     '#22d3ee', 70,  false, false, true,  false, null),
    (new.id, 'in_progress',         'In progress',         'Work underway',          'active',    '#3b82f6', 80,  false, false, true,  false, null),
    (new.id, 'awaiting_materials',  'Awaiting materials',  'Waiting for materials',  'blocked',   '#f59e0b', 90,  false, false, true,  true,  null),
    (new.id, 'awaiting_inspection', 'Awaiting inspection', 'Final checks',           'active',    '#fb923c', 100, false, false, true,  false, null),
    (new.id, 'completed',           'Completed',           'Completed',              'complete',  '#22c55e', 110, false, false, false, false, null),
    (new.id, 'invoiced',            'Invoiced',            'Completed',              'complete',  '#10b981', 120, false, false, false, false, null),
    (new.id, 'closed',              'Closed',              'Closed',                 'closed',    '#64748b', 130, false, true,  false, false, null),
    (new.id, 'cancelled',           'Cancelled',           'Cancelled',              'closed',    '#ef4444', 140, false, true,  false, false, null);

  insert into public.job_status_transitions (tenant_id, from_key, to_key, required_permission, created_by)
  select new.id, f, t, p, null from (values
    ('new','under_review',null), ('new','awaiting_survey',null), ('new','awaiting_quotation',null), ('new','approved','work_orders.approve'), ('new','scheduled','work_orders.assign'), ('new','cancelled',null),
    ('under_review','awaiting_survey',null), ('under_review','awaiting_quotation',null), ('under_review','approved','work_orders.approve'), ('under_review','scheduled','work_orders.assign'), ('under_review','cancelled',null),
    ('awaiting_survey','awaiting_quotation',null), ('awaiting_survey','approved','work_orders.approve'), ('awaiting_survey','scheduled','work_orders.assign'), ('awaiting_survey','cancelled',null),
    ('awaiting_quotation','awaiting_approval',null), ('awaiting_quotation','cancelled',null),
    ('awaiting_approval','approved','work_orders.approve'), ('awaiting_approval','awaiting_quotation',null), ('awaiting_approval','cancelled','work_orders.approve'),
    ('approved','scheduled','work_orders.assign'), ('approved','cancelled','work_orders.approve'),
    ('scheduled','in_progress',null), ('scheduled','awaiting_materials',null), ('scheduled','approved',null), ('scheduled','cancelled','work_orders.approve'),
    ('in_progress','awaiting_materials',null), ('in_progress','awaiting_inspection',null), ('in_progress','completed',null), ('in_progress','scheduled',null),
    ('awaiting_materials','scheduled',null), ('awaiting_materials','in_progress',null),
    ('awaiting_inspection','completed',null), ('awaiting_inspection','in_progress',null),
    ('completed','invoiced','finance.write'), ('completed','in_progress','work_orders.approve'), ('completed','closed',null),
    ('invoiced','closed','finance.write'),
    ('cancelled','new','work_orders.approve')
  ) as x(f, t, p);

  -- Picklists
  insert into public.lookup_values (tenant_id, list, key, label, sort_order, created_by)
  select new.id, l, k, lbl, ord, null from (values
    ('trade','joiner','Joiner',1), ('trade','plumber','Plumber',2), ('trade','electrician','Electrician',3), ('trade','roofer','Roofer',4),
    ('trade','plasterer','Plasterer',5), ('trade','painter_decorator','Painter & decorator',6), ('trade','tiler','Tiler',7), ('trade','bricklayer','Bricklayer',8),
    ('trade','gas_engineer','Gas engineer',9), ('trade','glazier','Glazier',10), ('trade','kitchen_fitter','Kitchen fitter',11), ('trade','flooring','Flooring',12),
    ('trade','groundworker','Groundworker',13), ('trade','labourer','Labourer',14), ('trade','multi_trade','Multi-trade',15), ('trade','supervisor','Supervisor',16),
    ('work_category','general_repairs','General repairs',1), ('work_category','joinery','Joinery',2), ('work_category','plumbing','Plumbing',3),
    ('work_category','electrical','Electrical',4), ('work_category','roofing','Roofing',5), ('work_category','windows_doors','Windows & doors',6),
    ('work_category','kitchens','Kitchen renovation',7), ('work_category','bathrooms','Bathroom renovation',8), ('work_category','void_refurbishment','Void refurbishment',9),
    ('work_category','adaptations','Accessibility adaptation',10), ('work_category','damp_mould','Damp & mould',11), ('work_category','plastering','Plastering',12),
    ('work_category','decoration','Decoration',13), ('work_category','heating','Heating',14), ('work_category','external_works','External works',15),
    ('work_category','commercial_refurb','Commercial refurbishment',16), ('work_category','education_refurb','Educational refurbishment',17), ('work_category','emergency_makesafe','Emergency make-safe',18),
    ('property_type','house','House',1), ('property_type','flat','Flat',2), ('property_type','tenement_flat','Tenement flat',3), ('property_type','cottage_flat','Cottage flat (four-in-a-block)',4),
    ('property_type','maisonette','Maisonette',5), ('property_type','bungalow','Bungalow',6), ('property_type','sheltered','Sheltered housing',7), ('property_type','bedsit','Bedsit',8),
    ('property_type','commercial_unit','Commercial unit',9), ('property_type','office','Office',10), ('property_type','school','School',11), ('property_type','community_building','Community building',12),
    ('organisation_category','housing_association','Housing association',1), ('organisation_category','local_authority','Local authority',2), ('organisation_category','property_manager','Property manager',3),
    ('organisation_category','letting_agent','Letting agent',4), ('organisation_category','commercial','Commercial',5), ('organisation_category','education','Education',6),
    ('organisation_category','healthcare','Healthcare',7), ('organisation_category','public_sector','Public sector',8), ('organisation_category','private_client','Private client',9), ('organisation_category','other','Other',10),
    ('contract_type','responsive_repairs','Responsive repairs',1), ('contract_type','planned_maintenance','Planned maintenance',2), ('contract_type','void_refurbishment','Void refurbishment',3),
    ('contract_type','term_maintenance','Term maintenance',4), ('contract_type','framework','Framework agreement',5), ('contract_type','adaptations','Adaptations',6),
    ('contract_type','capital_works','Capital works',7), ('contract_type','project','Single project',8), ('contract_type','schedule_of_rates','Schedule of rates',9), ('contract_type','other','Other',10),
    ('document_category','contract','Contract',1), ('document_category','certificate','Certificate',2), ('document_category','invoice','Invoice',3), ('document_category','purchase_order','Purchase order',4),
    ('document_category','work_instruction','Work instruction',5), ('document_category','rams','RAMS',6), ('document_category','method_statement','Method statement',7), ('document_category','report','Report',8),
    ('document_category','drawing','Drawing',9), ('document_category','insurance','Insurance',10), ('document_category','policy','Policy',11), ('document_category','photo_pack','Photo pack',12), ('document_category','other','Other',13),
    ('skill','cscs_card','CSCS card',1), ('skill','pasma','PASMA',2), ('skill','ipaf','IPAF',3), ('skill','asbestos_awareness','Asbestos awareness',4), ('skill','first_aid','First aid at work',5),
    ('skill','working_at_height','Working at height',6), ('skill','gas_safe','Gas Safe registered',7), ('skill','bs7671','BS 7671 (18th Edition)',8), ('skill','manual_handling','Manual handling',9),
    ('skill','fire_door','Fire door installer',10), ('skill','smsts','SMSTS',11), ('skill','sssts','SSSTS',12), ('skill','driving_licence','Driving licence',13), ('skill','disabled_adaptations','Disabled adaptations',14),
    ('absence_type','holiday','Holiday',1), ('absence_type','sickness','Sickness',2), ('absence_type','training','Training',3), ('absence_type','compassionate','Compassionate',4), ('absence_type','unpaid','Unpaid leave',5), ('absence_type','other','Other',6),
    ('lead_source','referral','Referral',1), ('lead_source','tender_portal','Tender portal (PCS)',2), ('lead_source','website','Website',3), ('lead_source','repeat_client','Repeat client',4),
    ('lead_source','networking','Networking',5), ('lead_source','framework','Framework call-off',6), ('lead_source','outreach','Outreach',7)
  ) as x(l, k, lbl, ord);

  insert into public.retention_policies (tenant_id, entity, retain_months, action, created_by) values
    (new.id, 'former_occupants', 24, 'anonymise', null),
    (new.id, 'ai_activity',      24, 'delete', null),
    (new.id, 'audit_logs',       84, 'delete', null),
    (new.id, 'communications',   72, 'delete', null),
    (new.id, 'inbound_messages', 24, 'delete', null),
    (new.id, 'notifications',     6, 'delete', null),
    (new.id, 'automation_runs',  12, 'delete', null);

  insert into public.checklist_templates (tenant_id, name, work_category, items, created_by) values
    (new.id, 'Standard completion checklist', null, '[{"label":"Area made safe and protected","required":true},{"label":"Work completed as instructed","required":true},{"label":"Before and after photos taken","required":true},{"label":"Waste removed from site","required":true},{"label":"Occupant shown completed work","required":false},{"label":"Sign-off obtained","required":true}]', null),
    (new.id, 'Void property checklist', 'void_refurbishment', '[{"label":"Keys received and logged","required":true},{"label":"Utilities checked and readings taken","required":true},{"label":"Electrical safety test arranged","required":true},{"label":"Gas safety check arranged","required":true},{"label":"Clean and clear completed","required":true},{"label":"Lettable standard inspection passed","required":true}]', null);

  -- Automation templates from the product brief (inactive until an admin switches them on)
  insert into public.automation_workflows (tenant_id, name, description, trigger_type, trigger_event, schedule_cron, conditions, actions, is_active, requires_approval, created_by) values
    (new.id, 'Work request to draft job', 'Extract an authorised work request, identify client and property, categorise, set suggested priority, create a DRAFT job, notify the manager and ask for anything missing. Scheduling only after approval.',
       'event', 'work_request.received', null, '[{"field":"is_authorised","op":"eq","value":true}]',
       '[{"type":"ai_extract"},{"type":"match_client"},{"type":"match_property"},{"type":"classify"},{"type":"create_draft_work_order"},{"type":"notify","role":"operations_manager"},{"type":"request_missing_information"}]', false, true, null),
    (new.id, 'Job deadline reminders', 'Remind the job manager 24 hours before a target completion date.', 'schedule', null, '0 7 * * *', '[]', '[{"type":"notify_due_jobs","hours_ahead":24}]', false, false, null),
    (new.id, 'Contract expiry reminders', 'Alert contract managers 90, 60 and 30 days before a contract ends.', 'schedule', null, '0 7 * * 1', '[]', '[{"type":"notify_expiring_contracts","days":[90,60,30]}]', false, false, null),
    (new.id, 'Material reorder notifications', 'Tell procurement when stock falls below its reorder level.', 'event', 'stock.below_reorder', null, '[]', '[{"type":"notify","role":"finance_manager"},{"type":"draft_requisition"}]', false, true, null),
    (new.id, 'Invoice reminders', 'Remind finance about overdue invoices and prepare a reminder email for approval.', 'schedule', null, '0 8 * * *', '[]', '[{"type":"notify_overdue_invoices"},{"type":"draft_client_reminder"}]', false, true, null),
    (new.id, 'Job completion notification', 'Tell the client contact when a job is completed, with photos.', 'event', 'work_order.completed', null, '[]', '[{"type":"notify_client","template":"job_completed"}]', false, true, null),
    (new.id, 'Customer satisfaction survey', 'Send a short satisfaction survey the day after completion.', 'event', 'work_order.completed', null, '[]', '[{"type":"send_survey","delay_hours":24}]', false, true, null),
    (new.id, 'Weekly management report', 'Generate the weekly management summary every Monday at 07:00.', 'schedule', null, '0 7 * * 1', '[]', '[{"type":"generate_report","report":"weekly_management"},{"type":"notify","role":"director"}]', false, false, null);

  insert into public.rate_cards (tenant_id, name, is_default, created_by) values (new.id, 'Standard labour & materials rates', true, null);
  return new;
end $$;

create trigger tenants_provision after insert on public.tenants
  for each row execute function app.provision_tenant();

-- -------------------------------------------------------------------------------------
-- Platform (BPOAI.AI super admin) functions
-- -------------------------------------------------------------------------------------
create or replace function public.platform_create_tenant(p_name text, p_slug text, p_plan text default 'trial', p_is_demo boolean default false, p_prefix text default 'PM')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.is_platform_admin() then raise exception 'platform admins only' using errcode = '42501'; end if;
  insert into public.tenants (name, slug, plan_key, is_demo, reference_prefix, trial_ends_at)
  values (p_name, p_slug, p_plan, p_is_demo, p_prefix, case when p_plan = 'trial' then now() + interval '30 days' end)
  returning id into v_id;
  insert into public.audit_logs (tenant_id, actor_id, actor_email, action, entity, entity_id, summary)
  values (null, auth.uid(), auth.jwt()->>'email', 'insert', 'tenants', v_id, 'Tenant created: ' || p_name);
  return v_id;
end $$;

create or replace function public.platform_update_subscription(p_tenant uuid, p_plan text, p_status text, p_seats integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'platform admins only' using errcode = '42501'; end if;
  update public.tenants set plan_key = p_plan, subscription_status = p_status, seats = p_seats where id = p_tenant;
  if not found then raise exception 'tenant not found' using errcode = 'P0002'; end if;
  insert into public.audit_logs (tenant_id, actor_id, actor_email, action, entity, entity_id, summary, changes)
  values (null, auth.uid(), auth.jwt()->>'email', 'update', 'tenants', p_tenant, 'Subscription changed', jsonb_build_object('plan', p_plan, 'status', p_status, 'seats', p_seats));
end $$;

-- Operational counts only (no business records) for the platform console.
create or replace function public.platform_tenant_overview()
returns table (id uuid, name text, slug text, plan_key text, subscription_status text, seats integer, is_demo boolean, created_at timestamptz, active_users bigint, work_orders bigint, properties bigint)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.slug, t.plan_key, t.subscription_status, t.seats, t.is_demo, t.created_at,
         (select count(*) from public.memberships m where m.tenant_id = t.id and m.status = 'active'),
         (select count(*) from public.work_orders w where w.tenant_id = t.id),
         (select count(*) from public.properties p where p.tenant_id = t.id)
  from public.tenants t
  where app.is_platform_admin()
  order by t.created_at
$$;

-- -------------------------------------------------------------------------------------
-- Storage: private buckets, objects namespaced by tenant id as the first folder
-- -------------------------------------------------------------------------------------
create or replace function app.internal_perm_tenant_texts(p_perm text) returns setof text
language sql stable security definer set search_path = '' as $$
  select x::text from app.internal_perm_tenants(p_perm) x
$$;
grant execute on function app.internal_perm_tenant_texts(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', false, 52428800, null),
  ('photos',    'photos',    false, 26214400, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

create policy "pmc documents read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] in (select app.internal_perm_tenant_texts('documents.read')));
create policy "pmc documents write" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] in (select app.internal_perm_tenant_texts('documents.write')));
create policy "pmc documents delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] in (select app.internal_perm_tenant_texts('documents.delete')));
create policy "pmc photos read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] in (select app.internal_perm_tenant_texts('work_orders.read')));
create policy "pmc photos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] in (select app.internal_perm_tenant_texts('work_orders.write')));
create policy "pmc photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] in (select app.internal_perm_tenant_texts('work_orders.write')));

-- -------------------------------------------------------------------------------------
-- Data retention job (run daily by the server cron with the service role)
-- -------------------------------------------------------------------------------------
create or replace function public.run_retention()
returns table (tenant_id uuid, entity text, affected bigint)
language plpgsql security definer set search_path = '' as $$
declare p record; v_cut timestamptz; v_n bigint;
begin
  for p in select * from public.retention_policies where is_active loop
    v_cut := now() - make_interval(months => p.retain_months);
    v_n := 0;
    if p.entity = 'former_occupants' then
      update public.occupants set full_name = 'Former occupant', phone = null, email = null, access_needs = null,
             vulnerability_flags = '{}', anonymised_at = now()
      where occupants.tenant_id = p.tenant_id and not is_current and anonymised_at is null and coalesce(move_out_date::timestamptz, updated_at) < v_cut;
      get diagnostics v_n = row_count;
    elsif p.entity = 'ai_activity' then
      delete from public.ai_activity a where a.tenant_id = p.tenant_id and a.created_at < v_cut; get diagnostics v_n = row_count;
    elsif p.entity = 'audit_logs' then
      delete from public.audit_logs a where a.tenant_id = p.tenant_id and a.created_at < v_cut; get diagnostics v_n = row_count;
    elsif p.entity = 'communications' then
      delete from public.communications c where c.tenant_id = p.tenant_id and c.created_at < v_cut; get diagnostics v_n = row_count;
    elsif p.entity = 'inbound_messages' then
      delete from public.inbound_messages m where m.tenant_id = p.tenant_id and m.created_at < v_cut; get diagnostics v_n = row_count;
    elsif p.entity = 'notifications' then
      delete from public.notifications n where n.tenant_id = p.tenant_id and n.created_at < v_cut; get diagnostics v_n = row_count;
    elsif p.entity = 'automation_runs' then
      delete from public.automation_runs r where r.tenant_id = p.tenant_id and r.created_at < v_cut; get diagnostics v_n = row_count;
    end if;
    update public.retention_policies set last_applied_at = now() where id = p.id;
    if v_n > 0 then
      insert into public.audit_logs (tenant_id, action, entity, summary, changes)
      values (p.tenant_id, 'retention', p.entity, 'Retention policy applied', jsonb_build_object('affected', v_n, 'older_than', v_cut, 'action', p.action));
    end if;
    tenant_id := p.tenant_id; entity := p.entity; affected := v_n; return next;
  end loop;
end $$;
revoke execute on function public.run_retention() from public, anon, authenticated;
grant execute on function public.run_retention() to service_role;
