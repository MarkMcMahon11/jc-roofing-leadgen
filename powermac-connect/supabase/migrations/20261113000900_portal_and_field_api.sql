-- =====================================================================================
-- POWERMAC CONNECT - 0900 Client portal & field app API (Stage 4)
-- External users never read base tables (RLS gives them nothing). These SECURITY DEFINER
-- functions are their whole API: each one resolves the caller's membership scope, checks
-- the permission, and returns an explicit, minimal column list.
-- =====================================================================================

-- Caller's scope in a tenant, or an error.
create or replace function app.require_scope(p_tenant uuid, p_scopes text[], p_perm text)
returns table (scope_type text, organisation_id uuid, employee_id uuid, subcontractor_id uuid, occupant_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare m record;
begin
  select * into m from app.my_membership(p_tenant);
  if m.membership_id is null then raise exception 'no access to this company' using errcode = '42501'; end if;
  if not (m.scope_type = any(p_scopes)) then raise exception 'not available for your account type' using errcode = '42501'; end if;
  if p_perm is not null and not app.has_perm(p_tenant, p_perm) then raise exception 'your role does not allow this (%)', p_perm using errcode = '42501'; end if;
  return query select m.scope_type, m.organisation_id, m.employee_id, m.subcontractor_id, m.occupant_id;
end $$;

-- Work orders an operative/subcontractor may see: those assigned to them (not cancelled).
create or replace function app.my_field_job_ids(p_tenant uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct a.work_order_id
  from public.job_assignments a, app.my_membership(p_tenant) m
  where a.tenant_id = p_tenant and a.status <> 'cancelled'
    and ((m.scope_type = 'operative' and a.employee_id = m.employee_id)
      or (m.scope_type = 'subcontractor' and a.subcontractor_id = m.subcontractor_id))
$$;

-- =====================================================================================
-- CLIENT PORTAL
-- =====================================================================================
create or replace function public.portal_overview(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select * into s from app.require_scope(p_tenant, array['client'], 'work_orders.read');
  return jsonb_build_object(
    'organisation', (select name from public.organisations where id = s.organisation_id),
    'open_jobs', (select count(*) from public.work_orders w join public.job_statuses st on st.tenant_id = w.tenant_id and st.key = w.status where w.organisation_id = s.organisation_id and st.counts_as_open),
    'awaiting_your_approval', (select count(*) from public.quotations q where q.organisation_id = s.organisation_id and q.status = 'sent'),
    'completed_30d', (select count(*) from public.work_orders w where w.organisation_id = s.organisation_id and w.completed_at > now() - interval '30 days'),
    'properties', (select count(*) from public.properties p where p.organisation_id = s.organisation_id and p.archived_at is null),
    'overdue', (select count(*) from public.work_orders w join public.job_statuses st on st.tenant_id = w.tenant_id and st.key = w.status where w.organisation_id = s.organisation_id and st.counts_as_open and w.target_completion_at < now())
  );
end $$;

create or replace function public.portal_jobs(p_tenant uuid, p_open_only boolean default true, p_search text default null, p_limit integer default 200)
returns table (id uuid, reference text, client_reference text, title text, status_label text, status_colour text, is_open boolean, priority text,
               property_id uuid, address text, postcode text, reported_at timestamptz, target_completion_at timestamptz, scheduled_start timestamptz, completed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select * into s from app.require_scope(p_tenant, array['client'], 'work_orders.read');
  return query
  select w.id, w.reference, w.client_reference, w.title, coalesce(st.client_label, st.label), st.colour, st.counts_as_open, w.priority,
         p.id, p.address_line1 || coalesce(', ' || p.address_line2, ''), p.postcode, w.reported_at, w.target_completion_at, w.scheduled_start, w.completed_at
  from public.work_orders w
  join public.job_statuses st on st.tenant_id = w.tenant_id and st.key = w.status
  join public.properties p on p.id = w.property_id
  where w.organisation_id = s.organisation_id
    and (not p_open_only or st.counts_as_open)
    and (p_search is null or w.reference ilike '%' || p_search || '%' or w.title ilike '%' || p_search || '%' or w.client_reference ilike '%' || p_search || '%' or p.address_line1 ilike '%' || p_search || '%' or p.postcode ilike '%' || p_search || '%')
  order by w.reported_at desc
  limit least(p_limit, 500);
end $$;

create or replace function public.portal_job(p_tenant uuid, p_job uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record; j jsonb;
begin
  select * into s from app.require_scope(p_tenant, array['client'], 'work_orders.read');
  select jsonb_build_object(
    'id', w.id, 'reference', w.reference, 'client_reference', w.client_reference, 'title', w.title, 'description', w.description,
    'status', coalesce(st.client_label, st.label), 'status_colour', st.colour, 'priority', w.priority,
    'reported_at', w.reported_at, 'target_completion_at', w.target_completion_at, 'scheduled_start', w.scheduled_start, 'completed_at', w.completed_at,
    'completion_notes', w.completion_notes, 'signoff_name', w.signoff_name, 'signoff_at', w.signoff_at,
    'property', jsonb_build_object('id', p.id, 'address', p.address_line1 || coalesce(', ' || p.address_line2, '') || ', ' || p.town, 'postcode', p.postcode),
    'contract', (select c.title from public.contracts c where c.id = w.contract_id),
    'timeline', coalesce((select jsonb_agg(jsonb_build_object('at', u.created_at, 'type', u.type, 'body', u.body,
                 'to_status', (select coalesce(x.client_label, x.label) from public.job_statuses x where x.tenant_id = w.tenant_id and x.key = u.to_status),
                 'by', case when u.type = 'client_message' then (select full_name from public.profiles where id = u.author_id) else 'PowerMac' end) order by u.created_at desc)
               from public.job_updates u where u.work_order_id = w.id and u.visibility = 'client'), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('path', ph.storage_path, 'stage', ph.stage, 'caption', ph.caption, 'at', ph.created_at) order by ph.created_at)
               from public.photos ph where ph.work_order_id = w.id and ph.visibility in ('client','occupant')), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'reference', q.reference, 'status', q.status, 'total', q.total)) from public.quotations q
               where q.work_order_id = w.id and q.status <> 'draft' and q.status <> 'internal_review' and app.has_perm(p_tenant, 'quotes.read')), '[]'::jsonb)
  ) into j
  from public.work_orders w
  join public.job_statuses st on st.tenant_id = w.tenant_id and st.key = w.status
  join public.properties p on p.id = w.property_id
  where w.id = p_job and w.organisation_id = s.organisation_id;
  if j is null then raise exception 'job not found' using errcode = 'P0002'; end if;
  return j;
end $$;

-- Signed URLs for portal photos are created server-side after this check.
create or replace function public.portal_can_view_photo(p_tenant uuid, p_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select * into s from app.require_scope(p_tenant, array['client'], 'work_orders.read');
  return exists (select 1 from public.photos ph join public.work_orders w on w.id = ph.work_order_id
                 where ph.storage_path = p_path and w.organisation_id = s.organisation_id and ph.visibility in ('client','occupant'));
end $$;

create or replace function public.portal_properties(p_tenant uuid, p_search text default null)
returns table (id uuid, reference text, client_reference text, address text, town text, postcode text, property_type text, status text, open_jobs bigint)
language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select * into s from app.require_scope(p_tenant, array['client'], 'properties.read');
  return query
  select p.id, p.reference, p.client_reference, p.address_line1 || coalesce(', ' || p.address_line2, ''), p.town, p.postcode, p.property_type, p.status,
         (select count(*) from public.work_orders w join public.job_statuses st on st.tenant_id = w.tenant_id and st.key = w.status where w.property_id = p.id and st.counts_as_open)
  from public.properties p
  where p.organisation_id = s.organisation_id and p.archived_at is null
    and (p_search is null or p.address_line1 ilike '%' || p_search || '%' or p.postcode ilike '%' || p_search || '%' or p.reference ilike '%' || p_search || '%' or p.client_reference ilike '%' || p_search || '%')
  order by p.postcode, p.address_line1;
end $$;

create or replace function public.portal_submit_request(p_tenant uuid, p_property uuid, p_title text, p_description text, p_priority text, p_client_reference text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s record; v_id uuid; v_contract uuid; v_initial text;
begin
  select * into s from app.require_scope(p_tenant, array['client'], 'portal.request');
  if not exists (select 1 from public.properties where id = p_property and organisation_id = s.organisation_id) then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  if p_priority not in ('emergency','urgent','routine','planned') then raise exception 'invalid priority' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_title, ''))) < 3 then raise exception 'please describe the problem' using errcode = '22023'; end if;
  select cp.contract_id into v_contract from public.contract_properties cp join public.contracts c on c.id = cp.contract_id
    where cp.property_id = p_property and c.status = 'active' order by c.contract_type = 'responsive_repairs' desc limit 1;
  select key into v_initial from public.job_statuses where tenant_id = p_tenant and is_initial;
  insert into public.work_orders (tenant_id, organisation_id, contract_id, property_id, title, description, priority, status, source, client_reference, created_by)
  values (p_tenant, s.organisation_id, v_contract, p_property, left(btrim(p_title), 200), left(p_description, 20000), p_priority, coalesce(v_initial, 'new'), 'portal', left(p_client_reference, 60), auth.uid())
  returning id into v_id;
  insert into public.notifications (tenant_id, user_id, type, severity, title, body, link)
  select p_tenant, m.user_id, 'portal.request', case when p_priority = 'emergency' then 'critical' else 'info' end,
         'New ' || p_priority || ' request from the client portal', left(btrim(p_title), 200), '/jobs/' || v_id
  from public.memberships m join public.role_permissions rp on rp.role_id = m.role_id and rp.permission_key = 'work_orders.assign'
  join public.roles r on r.id = m.role_id and r.scope_type = 'internal'
  where m.tenant_id = p_tenant and m.status = 'active';
  return v_id;
end $$;

create or replace function public.portal_add_message(p_tenant uuid, p_job uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  select * into s from app.require_scope(p_tenant, array['client'], 'communications.write');
  if not exists (select 1 from public.work_orders where id = p_job and organisation_id = s.organisation_id) then raise exception 'job not found' using errcode = 'P0002'; end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then raise exception 'message is empty' using errcode = '22023'; end if;
  insert into public.job_updates (tenant_id, work_order_id, author_id, type, body, visibility, created_by)
  values (p_tenant, p_job, auth.uid(), 'client_message', left(btrim(p_body), 5000), 'client', auth.uid());
end $$;

create or replace function public.portal_quotes(p_tenant uuid)
returns table (id uuid, reference text, title text, status text, total numeric, vat_total numeric, subtotal numeric, valid_until date, sent_at timestamptz, decided_at timestamptz,
               job_id uuid, job_reference text, address text, lines jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select * into s from app.require_scope(p_tenant, array['client'], 'quotes.read');
  return query
  select q.id, q.reference, q.title, q.status, q.total, q.vat_total, q.subtotal, q.valid_until, q.sent_at, q.decided_at, q.work_order_id, w.reference,
         (select p.address_line1 || ', ' || p.postcode from public.properties p where p.id = q.property_id),
         coalesce((select jsonb_agg(jsonb_build_object('description', l.description, 'quantity', l.quantity, 'unit', l.unit, 'unit_price', l.unit_price, 'total', l.line_total) order by l.sort_order)
                   from public.quotation_lines l where l.quotation_id = q.id), '[]'::jsonb)
  from public.quotations q left join public.work_orders w on w.id = q.work_order_id
  where q.organisation_id = s.organisation_id and q.status in ('sent','approved','rejected','expired')
  order by (q.status = 'sent') desc, q.sent_at desc nulls last;
end $$;

create or replace function public.portal_decide_quote(p_tenant uuid, p_quote uuid, p_approve boolean, p_name text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s record; v_wo uuid;
begin
  select * into s from app.require_scope(p_tenant, array['client'], 'quotes.approve');
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'enter your name to record the decision' using errcode = '22023'; end if;
  update public.quotations set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), decided_by_name = left(btrim(p_name), 160),
         decided_by_user = auth.uid(), rejection_reason = case when p_approve then null else left(p_reason, 2000) end
  where id = p_quote and organisation_id = s.organisation_id and status = 'sent'
  returning work_order_id into v_wo;
  if not found then raise exception 'this quotation is not awaiting a decision' using errcode = 'P0002'; end if;
  insert into public.audit_logs (tenant_id, actor_id, actor_email, action, entity, entity_id, summary)
  values (p_tenant, auth.uid(), auth.jwt()->>'email', case when p_approve then 'approve' else 'reject' end, 'quotations', p_quote, 'Client ' || case when p_approve then 'approved' else 'rejected' end || ' quotation (' || btrim(p_name) || ')');
  if v_wo is not null then
    insert into public.job_updates (tenant_id, work_order_id, author_id, type, body, visibility)
    values (p_tenant, v_wo, auth.uid(), case when p_approve then 'approval' else 'rejection' end,
            'Quotation ' || case when p_approve then 'approved' else 'rejected' end || ' by ' || btrim(p_name) || ' via the client portal' || coalesce(': ' || p_reason, ''), 'client');
    -- the client's decision goes to the people who may approve the job (the workflow stays authoritative)
    insert into public.notifications (tenant_id, user_id, type, severity, title, body, link)
    select p_tenant, m.user_id, 'quote.decided', case when p_approve then 'success' else 'warning' end,
           'Client ' || case when p_approve then 'approved' else 'rejected' end || ' a quotation',
           btrim(p_name) || coalesce(': ' || p_reason, ''), '/jobs/' || v_wo
    from public.memberships m join public.role_permissions rp on rp.role_id = m.role_id and rp.permission_key = 'work_orders.approve'
    join public.roles r on r.id = m.role_id and r.scope_type = 'internal'
    where m.tenant_id = p_tenant and m.status = 'active';
  end if;
end $$;

create or replace function public.portal_invoices(p_tenant uuid)
returns table (id uuid, reference text, status text, issue_date date, due_date date, subtotal numeric, vat_total numeric, total numeric, amount_paid numeric, job_reference text, purchase_order_ref text)
language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select * into s from app.require_scope(p_tenant, array['client'], 'finance.read');
  return query
  select i.id, i.reference, i.status, i.issue_date, i.due_date, i.subtotal, i.vat_total, i.total, i.amount_paid, w.reference, i.purchase_order_ref
  from public.invoices i left join public.work_orders w on w.id = i.work_order_id
  where i.organisation_id = s.organisation_id and i.status not in ('draft')
  order by i.issue_date desc nulls last;
end $$;

create or replace function public.portal_contracts(p_tenant uuid)
returns table (id uuid, reference text, title text, contract_type text, status text, start_date date, end_date date, jobs_open bigint, jobs_completed bigint, on_time_pct numeric, avg_satisfaction numeric)
language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select * into s from app.require_scope(p_tenant, array['client'], 'contracts.read');
  return query
  select c.id, c.reference, c.title, c.contract_type, c.status, c.start_date, c.end_date,
         (select count(*) from public.work_orders w join public.job_statuses st on st.tenant_id = w.tenant_id and st.key = w.status where w.contract_id = c.id and st.counts_as_open),
         (select count(*) from public.work_orders w where w.contract_id = c.id and w.completed_at is not null),
         (select round(100.0 * count(*) filter (where w.completed_at <= w.target_completion_at) / nullif(count(*) filter (where w.target_completion_at is not null), 0), 1) from public.work_orders w where w.contract_id = c.id and w.completed_at is not null),
         (select round(avg(w.satisfaction_score), 2) from public.work_orders w where w.contract_id = c.id)
  from public.contracts c where c.organisation_id = s.organisation_id and c.status in ('active','completed','expired')
  order by c.status = 'active' desc, c.end_date;
end $$;

-- =====================================================================================
-- FIELD APP (operatives and subcontractors)
-- =====================================================================================
create or replace function public.field_my_jobs(p_tenant uuid, p_from date, p_to date)
returns table (assignment_id uuid, work_order_id uuid, reference text, title text, priority text, job_status text, job_status_label text, status_colour text,
               assignment_status text, scheduled_start timestamptz, scheduled_end timestamptz, address text, town text, postcode text, latitude numeric, longitude numeric,
               access_notes text, hazards text[], trade text)
language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select * into s from app.require_scope(p_tenant, array['operative','subcontractor'], 'work_orders.read');
  return query
  select a.id, w.id, w.reference, w.title, w.priority, w.status, st.label, st.colour, a.status, a.scheduled_start, a.scheduled_end,
         p.address_line1 || coalesce(', ' || p.address_line2, ''), p.town, p.postcode, p.latitude, p.longitude,
         concat_ws(' · ', nullif(p.access_notes, ''), nullif(w.access_notes, '')), p.hazards, w.trade
  from public.job_assignments a
  join public.work_orders w on w.id = a.work_order_id
  join public.job_statuses st on st.tenant_id = w.tenant_id and st.key = w.status
  join public.properties p on p.id = w.property_id
  where a.tenant_id = p_tenant and a.status <> 'cancelled'
    and ((s.scope_type = 'operative' and a.employee_id = s.employee_id) or (s.scope_type = 'subcontractor' and a.subcontractor_id = s.subcontractor_id))
    and (a.scheduled_start at time zone 'Europe/London')::date between p_from and p_to
  order by a.scheduled_start;
end $$;

create or replace function public.field_job(p_tenant uuid, p_assignment uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record; j jsonb;
begin
  select * into s from app.require_scope(p_tenant, array['operative','subcontractor'], 'work_orders.read');
  select jsonb_build_object(
    'assignment', jsonb_build_object('id', a.id, 'status', a.status, 'start', a.scheduled_start, 'end', a.scheduled_end, 'arrived_at', a.arrived_at, 'started_at', a.started_at, 'finished_at', a.finished_at),
    'job', jsonb_build_object('id', w.id, 'reference', w.reference, 'title', w.title, 'description', w.description, 'priority', w.priority, 'status', w.status,
       'status_label', st.label, 'trade', w.trade, 'work_category', w.work_category, 'target_completion_at', w.target_completion_at, 'estimated_hours', w.estimated_hours,
       'access_notes', w.access_notes, 'signoff_name', w.signoff_name, 'signoff_at', w.signoff_at, 'client', (select name from public.organisations where id = w.organisation_id)),
    'property', jsonb_build_object('address', p.address_line1 || coalesce(', ' || p.address_line2, ''), 'town', p.town, 'postcode', p.postcode, 'lat', p.latitude, 'lng', p.longitude,
       'access_notes', p.access_notes, 'restrictions', p.restrictions, 'hazards', p.hazards, 'key_safe_info', p.key_safe_info),
    'occupant', case when app.has_perm(p_tenant, 'occupants.read') and o.id is not null and o.consent_to_contact
       then jsonb_build_object('name', o.full_name, 'phone', o.phone, 'access_needs', o.access_needs, 'preferred_contact', o.preferred_contact) end,
    'checklists', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'items', c.items, 'completed_at', c.completed_at)) from public.job_checklists c where c.work_order_id = w.id), '[]'::jsonb),
    'materials', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'description', m.description, 'quantity', m.quantity, 'unit', m.unit, 'status', m.status) order by m.created_at) from public.job_materials m where m.work_order_id = w.id), '[]'::jsonb),
    'updates', coalesce((select jsonb_agg(jsonb_build_object('at', u.created_at, 'type', u.type, 'body', u.body, 'by', (select full_name from public.profiles where id = u.author_id)) order by u.created_at desc)
       from (select * from public.job_updates where work_order_id = w.id order by created_at desc limit 30) u), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('path', ph.storage_path, 'stage', ph.stage, 'caption', ph.caption) order by ph.created_at) from public.photos ph where ph.work_order_id = w.id), '[]'::jsonb),
    'timesheets', coalesce((select jsonb_agg(jsonb_build_object('date', t.work_date, 'hours', t.hours, 'type', t.entry_type, 'status', t.status)) from public.timesheets t where t.work_order_id = w.id and t.employee_id = s.employee_id), '[]'::jsonb)
  ) into j
  from public.job_assignments a
  join public.work_orders w on w.id = a.work_order_id
  join public.job_statuses st on st.tenant_id = w.tenant_id and st.key = w.status
  join public.properties p on p.id = w.property_id
  left join public.occupants o on o.id = w.occupant_id
  where a.id = p_assignment and a.tenant_id = p_tenant and a.status <> 'cancelled'
    and ((s.scope_type = 'operative' and a.employee_id = s.employee_id) or (s.scope_type = 'subcontractor' and a.subcontractor_id = s.subcontractor_id));
  if j is null then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  return j;
end $$;

-- Moves the job along the CONFIGURED workflow only (never invents a transition).
create or replace function app.field_move_job(p_job uuid, p_to text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.work_orders w set status = p_to
  where w.id = p_job and w.status <> p_to
    and exists (select 1 from public.job_status_transitions t where t.tenant_id = w.tenant_id and t.from_key = w.status and t.to_key = p_to and t.required_permission is null);
end $$;

-- p_client_ref makes the call idempotent so the offline outbox can safely retry.
create or replace function public.field_update(p_tenant uuid, p_assignment uuid, p_action text, p_note text default null, p_client_ref text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s record; a record; v_type text; v_body text;
begin
  select * into s from app.require_scope(p_tenant, array['operative','subcontractor'], 'field.update');
  select * into a from public.job_assignments x
  where x.id = p_assignment and x.tenant_id = p_tenant and x.status <> 'cancelled'
    and ((s.scope_type = 'operative' and x.employee_id = s.employee_id) or (s.scope_type = 'subcontractor' and x.subcontractor_id = s.subcontractor_id));
  if a.id is null then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  if p_client_ref is not null and exists (select 1 from public.job_updates u where u.work_order_id = a.work_order_id and u.data->>'client_ref' = p_client_ref) then
    return jsonb_build_object('status', a.status, 'duplicate', true);
  end if;

  case p_action
    when 'accept'     then update public.job_assignments set status = 'accepted' where id = a.id; v_type := 'system'; v_body := 'Assignment accepted';
    when 'travelling' then update public.job_assignments set status = 'travelling' where id = a.id; v_type := 'system'; v_body := 'On the way';
    when 'arrived'    then update public.job_assignments set status = 'on_site', arrived_at = coalesce(arrived_at, now()) where id = a.id; v_type := 'arrival'; v_body := 'Arrived on site';
    when 'start'      then update public.job_assignments set status = 'on_site', started_at = coalesce(started_at, now()), arrived_at = coalesce(arrived_at, now()) where id = a.id;
                           update public.work_orders set actual_start = coalesce(actual_start, now()) where id = a.work_order_id;
                           perform app.field_move_job(a.work_order_id, 'in_progress'); v_type := 'start'; v_body := 'Work started';
    when 'pause'      then update public.job_assignments set status = 'paused' where id = a.id; v_type := 'system'; v_body := 'Work paused';
    when 'no_access'  then update public.job_assignments set status = 'no_access', finished_at = now() where id = a.id; v_type := 'issue'; v_body := 'No access to the property';
    when 'finish'     then update public.job_assignments set status = 'completed', finished_at = now() where id = a.id;
                           update public.work_orders set actual_end = now() where id = a.work_order_id;
                           perform app.field_move_job(a.work_order_id, 'awaiting_inspection'); v_type := 'finish'; v_body := 'Work finished - submitted for inspection';
    when 'note'       then v_type := 'note'; v_body := p_note;
    when 'issue'      then v_type := 'issue'; v_body := p_note;
    when 'approval_request' then v_type := 'approval_request'; v_body := p_note;
    else raise exception 'unknown action %', p_action using errcode = '22023';
  end case;
  if p_note is not null and p_action not in ('note','issue','approval_request') then v_body := v_body || ': ' || p_note; end if;
  if v_body is null or btrim(v_body) = '' then raise exception 'please add a note' using errcode = '22023'; end if;

  insert into public.job_updates (tenant_id, work_order_id, author_id, type, body, data, visibility, created_by)
  values (p_tenant, a.work_order_id, auth.uid(), v_type, left(v_body, 5000), jsonb_build_object('client_ref', p_client_ref, 'assignment_id', a.id, 'source', 'field'),
          case when v_type in ('issue','approval_request','note') then 'internal' else 'client' end, auth.uid());

  if p_action in ('issue','approval_request','no_access') then
    insert into public.notifications (tenant_id, user_id, type, severity, title, body, link)
    select p_tenant, m.user_id, 'field.' || p_action, case when p_action = 'approval_request' then 'warning' else 'critical' end,
           case p_action when 'issue' then 'Issue reported on site' when 'no_access' then 'No access at property' else 'Operative requests approval' end,
           left(v_body, 300), '/jobs/' || a.work_order_id
    from public.memberships m join public.role_permissions rp on rp.role_id = m.role_id and rp.permission_key = 'work_orders.assign'
    join public.roles r on r.id = m.role_id and r.scope_type = 'internal'
    where m.tenant_id = p_tenant and m.status = 'active';
  end if;
  return jsonb_build_object('status', (select status from public.job_assignments where id = a.id));
end $$;

create or replace function public.field_add_material(p_tenant uuid, p_assignment uuid, p_description text, p_quantity numeric, p_unit text default 'each', p_client_ref text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s record; v_wo uuid; v_mat record;
begin
  select * into s from app.require_scope(p_tenant, array['operative','subcontractor'], 'field.update');
  select a.work_order_id into v_wo from public.job_assignments a where a.id = p_assignment and a.tenant_id = p_tenant and a.status <> 'cancelled'
    and ((s.scope_type = 'operative' and a.employee_id = s.employee_id) or (s.scope_type = 'subcontractor' and a.subcontractor_id = s.subcontractor_id));
  if v_wo is null then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be more than zero' using errcode = '22023'; end if;
  if p_client_ref is not null and exists (select 1 from public.job_updates u where u.work_order_id = v_wo and u.data->>'client_ref' = p_client_ref) then return; end if;
  select id, unit_cost, unit into v_mat from public.materials where tenant_id = p_tenant and (lower(name) = lower(btrim(p_description)) or lower(sku) = lower(btrim(p_description))) limit 1;
  insert into public.job_materials (tenant_id, work_order_id, material_id, description, quantity, unit, unit_cost, status, created_by)
  values (p_tenant, v_wo, v_mat.id, left(btrim(p_description), 300), p_quantity, coalesce(v_mat.unit, p_unit, 'each'), v_mat.unit_cost, 'used', auth.uid());
  insert into public.job_updates (tenant_id, work_order_id, author_id, type, body, data, created_by)
  values (p_tenant, v_wo, auth.uid(), 'materials', 'Used ' || p_quantity || ' ' || coalesce(v_mat.unit, p_unit, 'each') || ' ' || btrim(p_description), jsonb_build_object('client_ref', p_client_ref), auth.uid());
end $$;

create or replace function public.field_submit_timesheet(p_tenant uuid, p_assignment uuid, p_date date, p_hours numeric, p_type text default 'labour', p_notes text default null, p_client_ref text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s record; v_wo uuid;
begin
  select * into s from app.require_scope(p_tenant, array['operative'], 'field.update');
  select a.work_order_id into v_wo from public.job_assignments a where a.id = p_assignment and a.tenant_id = p_tenant and a.employee_id = s.employee_id and a.status <> 'cancelled';
  if v_wo is null then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  if p_hours is null or p_hours <= 0 or p_hours > 16 then raise exception 'hours must be between 0 and 16' using errcode = '22023'; end if;
  if p_date > current_date or p_date < current_date - 14 then raise exception 'timesheets can be submitted for the last 14 days' using errcode = '22023'; end if;
  if p_type not in ('labour','travel','overtime') then raise exception 'invalid entry type' using errcode = '22023'; end if;
  if p_client_ref is not null and exists (select 1 from public.timesheets t where t.employee_id = s.employee_id and t.notes like '%[' || p_client_ref || ']%') then return; end if;
  insert into public.timesheets (tenant_id, employee_id, work_order_id, work_date, hours, entry_type, status, notes, created_by)
  values (p_tenant, s.employee_id, v_wo, p_date, p_hours, p_type, 'submitted', left(coalesce(p_notes, ''), 1900) || case when p_client_ref is not null then ' [' || p_client_ref || ']' else '' end, auth.uid());
end $$;

create or replace function public.field_checklist(p_tenant uuid, p_assignment uuid, p_checklist uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare s record; v_wo uuid; v_all boolean;
begin
  select * into s from app.require_scope(p_tenant, array['operative','subcontractor'], 'field.update');
  select a.work_order_id into v_wo from public.job_assignments a where a.id = p_assignment and a.tenant_id = p_tenant and a.status <> 'cancelled'
    and ((s.scope_type = 'operative' and a.employee_id = s.employee_id) or (s.scope_type = 'subcontractor' and a.subcontractor_id = s.subcontractor_id));
  if v_wo is null then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'invalid checklist' using errcode = '22023'; end if;
  select bool_and(coalesce((i->>'done')::boolean, false) or not coalesce((i->>'required')::boolean, false)) into v_all from jsonb_array_elements(p_items) i;
  update public.job_checklists set items = p_items, completed_at = case when v_all then coalesce(completed_at, now()) end, completed_by = case when v_all then auth.uid() end
  where id = p_checklist and work_order_id = v_wo;
  if not found then raise exception 'checklist not found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.field_signoff(p_tenant uuid, p_assignment uuid, p_name text, p_satisfaction integer default null, p_signature_path text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s record; v_wo uuid;
begin
  select * into s from app.require_scope(p_tenant, array['operative','subcontractor'], 'field.update');
  select a.work_order_id into v_wo from public.job_assignments a where a.id = p_assignment and a.tenant_id = p_tenant and a.status <> 'cancelled'
    and ((s.scope_type = 'operative' and a.employee_id = s.employee_id) or (s.scope_type = 'subcontractor' and a.subcontractor_id = s.subcontractor_id));
  if v_wo is null then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'enter the name of the person signing' using errcode = '22023'; end if;
  if p_satisfaction is not null and (p_satisfaction < 1 or p_satisfaction > 5) then raise exception 'rating must be 1 to 5' using errcode = '22023'; end if;
  update public.work_orders set signoff_name = left(btrim(p_name), 160), signoff_at = now(), satisfaction_score = coalesce(p_satisfaction, satisfaction_score),
         signoff_signature_path = coalesce(p_signature_path, signoff_signature_path) where id = v_wo;
  insert into public.job_updates (tenant_id, work_order_id, author_id, type, body, visibility, created_by)
  values (p_tenant, v_wo, auth.uid(), 'signoff', 'Customer sign-off by ' || btrim(p_name) || coalesce(' (rating ' || p_satisfaction || '/5)', ''), 'client', auth.uid());
end $$;

create or replace function public.field_add_photo(p_tenant uuid, p_assignment uuid, p_path text, p_stage text, p_caption text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s record; v_wo uuid;
begin
  select * into s from app.require_scope(p_tenant, array['operative','subcontractor'], 'field.update');
  select a.work_order_id into v_wo from public.job_assignments a where a.id = p_assignment and a.tenant_id = p_tenant and a.status <> 'cancelled'
    and ((s.scope_type = 'operative' and a.employee_id = s.employee_id) or (s.scope_type = 'subcontractor' and a.subcontractor_id = s.subcontractor_id));
  if v_wo is null then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  if p_path not like p_tenant::text || '/jobs/' || v_wo::text || '/%' then raise exception 'invalid photo location' using errcode = '22023'; end if;
  if p_stage not in ('before','during','after','issue','signoff') then raise exception 'invalid stage' using errcode = '22023'; end if;
  insert into public.photos (tenant_id, work_order_id, storage_path, caption, stage, taken_at, visibility, created_by)
  values (p_tenant, v_wo, p_path, left(p_caption, 500), p_stage, now(), case when p_stage = 'issue' then 'internal' else 'client' end, auth.uid());
  insert into public.job_updates (tenant_id, work_order_id, author_id, type, body, created_by)
  values (p_tenant, v_wo, auth.uid(), 'photo', initcap(p_stage) || ' photo added' || coalesce(': ' || p_caption, ''), auth.uid());
end $$;

-- Field users may upload photos only into the folders of jobs assigned to them.
create policy "pmc photos field upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and exists (
      select 1 from public.job_assignments a join public.memberships m on m.tenant_id = a.tenant_id and m.user_id = auth.uid() and m.status = 'active'
      where (storage.foldername(name))[1] = a.tenant_id::text and (storage.foldername(name))[2] = 'jobs' and (storage.foldername(name))[3] = a.work_order_id::text
        and a.status <> 'cancelled' and (a.employee_id = m.employee_id or a.subcontractor_id = m.subcontractor_id)
    )
  );
create policy "pmc photos field read" on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and exists (
      select 1 from public.job_assignments a join public.memberships m on m.tenant_id = a.tenant_id and m.user_id = auth.uid() and m.status = 'active'
      where (storage.foldername(name))[1] = a.tenant_id::text and (storage.foldername(name))[3] = a.work_order_id::text
        and a.status <> 'cancelled' and (a.employee_id = m.employee_id or a.subcontractor_id = m.subcontractor_id)
    )
  );

-- All portal_/field_ functions: signed-in users only
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'portal\_%' or p.proname like 'field\_%') loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
grant execute on all functions in schema app to authenticated;
