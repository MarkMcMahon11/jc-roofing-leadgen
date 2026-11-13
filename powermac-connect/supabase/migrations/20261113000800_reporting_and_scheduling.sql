-- =====================================================================================
-- POWERMAC CONNECT - 0800 Reporting & scheduling intelligence
-- Every view/function here is SECURITY INVOKER: it runs with the caller's permissions, so
-- Row Level Security applies to every table it reads. A user without finance.read gets
-- zero revenue/cost (never someone else's numbers). The UI hides what a role cannot use.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Command-centre summary (one round trip)
-- -------------------------------------------------------------------------------------
create or replace function public.dashboard_summary(p_tenant uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with wo as (
    select w.id, w.status, w.priority, w.target_completion_at, w.completed_at, w.created_at, s.category, s.counts_as_open
    from public.work_orders w
    join public.job_statuses s on s.tenant_id = w.tenant_id and s.key = w.status
    where w.tenant_id = p_tenant
  ),
  today as (select (now() at time zone 'Europe/London')::date as d),
  month_start as (select date_trunc('month', (now() at time zone 'Europe/London'))::date as d),
  inv as (select * from public.invoices where tenant_id = p_tenant and status not in ('draft','void','credited')),
  cst as (select * from public.costs where tenant_id = p_tenant)
  select jsonb_build_object(
    'active_contracts',       (select count(*) from public.contracts where tenant_id = p_tenant and status = 'active'),
    'active_contract_value',  (select coalesce(sum(value), 0) from public.contracts where tenant_id = p_tenant and status = 'active'),
    'properties',             (select count(*) from public.properties where tenant_id = p_tenant and archived_at is null),
    'void_properties',        (select count(*) from public.properties where tenant_id = p_tenant and status = 'void'),
    'active_jobs',            (select count(*) from wo where counts_as_open),
    'new_requests',           (select count(*) from wo where category = 'intake'),
    'awaiting_approval',      (select count(*) from wo where status = 'awaiting_approval'),
    'in_progress',            (select count(*) from wo where category = 'active'),
    'blocked',                (select count(*) from wo where category = 'blocked'),
    'overdue',                (select count(*) from wo where counts_as_open and target_completion_at < now()),
    'emergencies_open',       (select count(*) from wo where counts_as_open and priority = 'emergency'),
    'completed_30d',          (select count(*) from wo where completed_at >= now() - interval '30 days'),
    'completed_awaiting_invoice', (select count(*) from wo where status = 'completed'),
    'scheduled_today',        (select count(distinct a.work_order_id) from public.job_assignments a, today
                               where a.tenant_id = p_tenant and a.status <> 'cancelled' and (a.scheduled_start at time zone 'Europe/London')::date = today.d),
    'operatives_active',      (select count(*) from public.employees where tenant_id = p_tenant and employment_status = 'active' and is_field_operative),
    'operatives_booked_today',(select count(distinct a.employee_id) from public.job_assignments a, today
                               where a.tenant_id = p_tenant and a.status <> 'cancelled' and a.employee_id is not null and (a.scheduled_start at time zone 'Europe/London')::date = today.d),
    'operatives_absent_today',(select count(distinct x.employee_id) from public.employee_absences x, today
                               where x.tenant_id = p_tenant and x.status = 'approved' and today.d between (x.starts_at at time zone 'Europe/London')::date and (x.ends_at at time zone 'Europe/London')::date),
    'subcontractor_jobs_live',(select count(distinct a.work_order_id) from public.job_assignments a join wo on wo.id = a.work_order_id
                               where a.tenant_id = p_tenant and a.subcontractor_id is not null and wo.counts_as_open and a.status <> 'cancelled'),
    'revenue_month',          (select coalesce(sum(subtotal), 0) from inv, month_start where issue_date >= month_start.d),
    'revenue_ytd',            (select coalesce(sum(subtotal), 0) from inv where issue_date >= make_date(extract(year from now())::int - case when extract(month from now()) < 4 then 1 else 0 end, 4, 1)),
    'outstanding',            (select coalesce(sum(total - amount_paid), 0) from inv where status in ('issued','part_paid','overdue')),
    'overdue_invoices',       (select count(*) from inv, today where status in ('issued','part_paid','overdue') and due_date < today.d),
    'overdue_amount',         (select coalesce(sum(total - amount_paid), 0) from inv, today where status in ('issued','part_paid','overdue') and due_date < today.d),
    'labour_cost_month',      (select coalesce(sum(amount), 0) from cst, month_start where category = 'labour' and incurred_on >= month_start.d),
    'materials_cost_month',   (select coalesce(sum(amount), 0) from cst, month_start where category = 'materials' and incurred_on >= month_start.d),
    'subcontractor_cost_month',(select coalesce(sum(amount), 0) from cst, month_start where category = 'subcontractor' and incurred_on >= month_start.d),
    'total_cost_month',       (select coalesce(sum(amount), 0) from cst, month_start where incurred_on >= month_start.d),
    'status_counts',          (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from wo group by status) x),
    'priority_open',          (select coalesce(jsonb_object_agg(priority, n), '{}'::jsonb) from (select priority, count(*) n from wo where counts_as_open group by priority) x)
  )
$$;

-- Monthly revenue and costs (financial year friendly: any number of months back)
create or replace function public.finance_monthly(p_tenant uuid, p_months integer default 6)
returns table (month date, revenue numeric, labour numeric, materials numeric, subcontractor numeric, vehicle numeric, overhead numeric, other numeric)
language sql stable security invoker set search_path = '' as $$
  with months as (
    select (date_trunc('month', (now() at time zone 'Europe/London')) - make_interval(months => g))::date as m
    from generate_series(0, greatest(least(p_months, 36), 1) - 1) g
  )
  select m.m,
    coalesce((select sum(i.subtotal) from public.invoices i where i.tenant_id = p_tenant and i.status not in ('draft','void','credited') and date_trunc('month', i.issue_date)::date = m.m), 0),
    coalesce((select sum(c.amount) from public.costs c where c.tenant_id = p_tenant and c.category = 'labour' and date_trunc('month', c.incurred_on)::date = m.m), 0),
    coalesce((select sum(c.amount) from public.costs c where c.tenant_id = p_tenant and c.category = 'materials' and date_trunc('month', c.incurred_on)::date = m.m), 0),
    coalesce((select sum(c.amount) from public.costs c where c.tenant_id = p_tenant and c.category = 'subcontractor' and date_trunc('month', c.incurred_on)::date = m.m), 0),
    coalesce((select sum(c.amount) from public.costs c where c.tenant_id = p_tenant and c.category = 'vehicle' and date_trunc('month', c.incurred_on)::date = m.m), 0),
    coalesce((select sum(c.amount) from public.costs c where c.tenant_id = p_tenant and c.category = 'overhead' and date_trunc('month', c.incurred_on)::date = m.m), 0),
    coalesce((select sum(c.amount) from public.costs c where c.tenant_id = p_tenant and c.category in ('plant','other') and date_trunc('month', c.incurred_on)::date = m.m), 0)
  from months m order by m.m
$$;

-- Jobs created vs completed per week
create or replace function public.job_throughput(p_tenant uuid, p_weeks integer default 12)
returns table (week date, created bigint, completed bigint)
language sql stable security invoker set search_path = '' as $$
  with weeks as (
    select (date_trunc('week', (now() at time zone 'Europe/London')) - make_interval(weeks => g))::date as w
    from generate_series(0, greatest(least(p_weeks, 104), 1) - 1) g
  )
  select w.w,
    (select count(*) from public.work_orders x where x.tenant_id = p_tenant and date_trunc('week', x.reported_at at time zone 'Europe/London')::date = w.w),
    (select count(*) from public.work_orders x where x.tenant_id = p_tenant and x.completed_at is not null and date_trunc('week', x.completed_at at time zone 'Europe/London')::date = w.w)
  from weeks w order by w.w
$$;

-- -------------------------------------------------------------------------------------
-- Per-job and per-contract performance
-- -------------------------------------------------------------------------------------
create or replace view public.v_job_financials with (security_invoker = true) as
select w.id as work_order_id, w.tenant_id, w.organisation_id, w.contract_id, w.estimated_cost,
  coalesce(i.revenue, 0) as invoiced_net,
  coalesce(c.labour, 0) as labour_cost,
  coalesce(c.materials, 0) as materials_cost,
  coalesce(c.subcontractor, 0) as subcontractor_cost,
  coalesce(c.other, 0) as other_cost,
  coalesce(c.total, 0) as total_cost,
  coalesce(i.revenue, 0) - coalesce(c.total, 0) as margin
from public.work_orders w
left join lateral (select sum(subtotal) revenue from public.invoices where work_order_id = w.id and status not in ('draft','void','credited')) i on true
left join lateral (
  select sum(amount) filter (where category = 'labour') labour, sum(amount) filter (where category = 'materials') materials,
         sum(amount) filter (where category = 'subcontractor') subcontractor, sum(amount) filter (where category not in ('labour','materials','subcontractor')) other,
         sum(amount) total
  from public.costs where work_order_id = w.id) c on true;

create or replace view public.v_contract_performance with (security_invoker = true) as
select c.id as contract_id, c.tenant_id, c.organisation_id, c.value, c.annual_budget,
  coalesce(j.total, 0) as jobs_total,
  coalesce(j.open, 0) as jobs_open,
  coalesce(j.completed, 0) as jobs_completed,
  coalesce(j.overdue, 0) as jobs_overdue,
  case when coalesce(j.completed_with_target, 0) > 0 then round(100.0 * j.on_time / j.completed_with_target, 1) end as on_time_pct,
  case when coalesce(j.ftf_known, 0) > 0 then round(100.0 * j.ftf / j.ftf_known, 1) end as first_time_fix_pct,
  j.avg_satisfaction,
  coalesce(i.revenue, 0) as revenue,
  coalesce(k.cost, 0) as cost,
  coalesce(i.revenue, 0) - coalesce(k.cost, 0) as margin,
  coalesce(k.cost_12m, 0) as cost_last_12m,
  (select count(*) from public.contract_properties cp where cp.contract_id = c.id) as properties
from public.contracts c
left join lateral (
  select count(*) total,
         count(*) filter (where s.counts_as_open) open,
         count(*) filter (where w.completed_at is not null) completed,
         count(*) filter (where s.counts_as_open and w.target_completion_at < now()) overdue,
         count(*) filter (where w.completed_at is not null and w.target_completion_at is not null) completed_with_target,
         count(*) filter (where w.completed_at is not null and w.completed_at <= w.target_completion_at) on_time,
         count(*) filter (where w.first_time_fix) ftf,
         count(*) filter (where w.first_time_fix is not null) ftf_known,
         round(avg(w.satisfaction_score), 2) avg_satisfaction
  from public.work_orders w join public.job_statuses s on s.tenant_id = w.tenant_id and s.key = w.status
  where w.contract_id = c.id) j on true
left join lateral (select sum(subtotal) revenue from public.invoices where contract_id = c.id and status not in ('draft','void','credited')) i on true
left join lateral (select sum(amount) cost, sum(amount) filter (where incurred_on >= current_date - 365) cost_12m from public.costs where contract_id = c.id) k on true;

-- -------------------------------------------------------------------------------------
-- Management alerts: renewals, expiring certifications, approvals, budgets, performance
-- -------------------------------------------------------------------------------------
create or replace function public.management_alerts(p_tenant uuid)
returns table (severity text, kind text, title text, detail text, link text, due date)
language sql stable security invoker set search_path = '' as $$
  -- contracts ending / renewal decisions
  select case when c.end_date - current_date <= 30 then 'critical' else 'warning' end, 'contract_expiry',
         c.title || ' ends in ' || (c.end_date - current_date) || ' days', o.name || ' · ' || c.reference, '/contracts/' || c.id, c.end_date
  from public.contracts c join public.organisations o on o.id = c.organisation_id
  where c.tenant_id = p_tenant and c.status = 'active' and c.end_date between current_date and current_date + 90
  union all
  select 'warning', 'contract_renewal', 'Renewal decision due: ' || c.title, o.name || ' · renewal date ' || to_char(c.renewal_date, 'DD Mon YYYY'), '/contracts/' || c.id, c.renewal_date
  from public.contracts c join public.organisations o on o.id = c.organisation_id
  where c.tenant_id = p_tenant and c.status = 'active' and c.renewal_date between current_date and current_date + 45
    and (c.end_date is null or c.end_date > current_date + 90)
  -- budget overruns (rolling 12 months against annual budget)
  union all
  select case when p.cost_last_12m > c.annual_budget then 'critical' else 'warning' end, 'budget',
         'Spend at ' || round(100 * p.cost_last_12m / c.annual_budget) || '% of annual budget', c.title, '/contracts/' || c.id, null
  from public.contracts c join public.v_contract_performance p on p.contract_id = c.id
  where c.tenant_id = p_tenant and c.status = 'active' and c.annual_budget > 0 and p.cost_last_12m >= 0.9 * c.annual_budget
  -- performance below KPI target
  union all
  select 'warning', 'performance', 'On-time completion ' || p.on_time_pct || '% (target ' || k.target_value || '%)', c.title, '/contracts/' || c.id, null
  from public.contracts c join public.v_contract_performance p on p.contract_id = c.id
  join public.contract_kpis k on k.contract_id = c.id and k.metric_key = 'on_time_completion'
  where c.tenant_id = p_tenant and c.status = 'active' and p.jobs_completed >= 5 and p.on_time_pct < k.target_value
  -- approvals waiting
  union all
  select 'info', 'approval', count(*) || ' jobs awaiting approval', 'Oldest waiting ' || (current_date - min(w.updated_at)::date) || ' days', '/jobs?status=awaiting_approval', null
  from public.work_orders w where w.tenant_id = p_tenant and w.status = 'awaiting_approval' having count(*) > 0
  union all
  select 'info', 'approval', 'Contract variation awaiting approval', v.title || ' · £' || to_char(v.value, 'FM999,999,990'), '/contracts/' || v.contract_id, null
  from public.contract_variations v where v.tenant_id = p_tenant and v.status = 'proposed'
  -- certifications and compliance
  union all
  select case when q.expires_on < current_date then 'critical' else 'warning' end, 'qualification',
         q.name || case when q.expires_on < current_date then ' expired' else ' expires ' || to_char(q.expires_on, 'DD Mon') end,
         e.first_name || ' ' || e.last_name, '/workforce/' || e.id, q.expires_on
  from public.qualifications q join public.employees e on e.id = q.employee_id
  where q.tenant_id = p_tenant and e.employment_status <> 'left' and q.expires_on <= current_date + 30
  union all
  select case when s.insurance_expiry < current_date then 'critical' else 'warning' end, 'insurance',
         'Insurance ' || case when s.insurance_expiry < current_date then 'expired' else 'expires ' || to_char(s.insurance_expiry, 'DD Mon') end,
         s.company_name, '/subcontractors/' || s.id, s.insurance_expiry
  from public.subcontractors s where s.tenant_id = p_tenant and s.status in ('approved','pending') and s.insurance_expiry <= current_date + 30
  union all
  select case when c.expires_on < current_date then 'critical' else 'warning' end, 'certificate',
         replace(initcap(replace(c.type, '_', ' ')), 'Eicr', 'EICR') || case when c.expires_on < current_date then ' certificate expired' else ' certificate due ' || to_char(c.expires_on, 'DD Mon') end,
         p.address_line1 || ', ' || p.town, '/properties/' || p.id, c.expires_on
  from public.certificates c join public.properties p on p.id = c.property_id
  where c.tenant_id = p_tenant and c.expires_on <= current_date + 30
    and not exists (select 1 from public.certificates n where n.property_id = c.property_id and n.type = c.type and n.issued_on > c.issued_on)
  union all
  select 'warning', 'vehicle', v.registration || ': ' || case when v.mot_due <= current_date + 21 then 'MOT due ' || to_char(v.mot_due, 'DD Mon') else 'insurance due ' || to_char(v.insurance_due, 'DD Mon') end,
         coalesce(v.make, '') || ' ' || coalesce(v.model, ''), '/workforce?tab=vehicles', least(v.mot_due, v.insurance_due)
  from public.vehicles v where v.tenant_id = p_tenant and v.status <> 'disposed' and (v.mot_due <= current_date + 21 or v.insurance_due <= current_date + 21)
  -- operations
  union all
  select 'critical', 'overdue', count(*) || ' jobs past their target date', 'Open jobs beyond the contract deadline', '/jobs?view=list&due=overdue', null
  from public.work_orders w join public.job_statuses s on s.tenant_id = w.tenant_id and s.key = w.status
  where w.tenant_id = p_tenant and s.counts_as_open and w.target_completion_at < now() having count(*) > 0
  union all
  select 'warning', 'stock', m.name || ' below reorder level', 'In stock ' || coalesce(sum(l.quantity), 0) || ' ' || m.unit || ' · reorder at ' || m.reorder_level, '/jobs', null
  from public.materials m left join public.stock_levels l on l.material_id = m.id
  where m.tenant_id = p_tenant and m.is_stock_item and m.reorder_level is not null and m.is_active
  group by m.id, m.name, m.unit, m.reorder_level having coalesce(sum(l.quantity), 0) < m.reorder_level
  union all
  select 'warning', 'invoice', count(*) || ' invoices overdue', '£' || to_char(sum(i.total - i.amount_paid), 'FM999,999,990') || ' outstanding past due date', '/dashboard#finance', null
  from public.invoices i where i.tenant_id = p_tenant and i.status in ('issued','part_paid','overdue') and i.due_date < current_date having count(*) > 0
$$;

-- -------------------------------------------------------------------------------------
-- Global search (what the caller can see)
-- -------------------------------------------------------------------------------------
create or replace function public.search_everything(p_tenant uuid, p_query text, p_limit integer default 6)
returns table (kind text, id uuid, title text, subtitle text, link text)
language sql stable security invoker set search_path = '' as $$
  with q as (select '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%' as p)
  (select 'job', w.id, w.reference || ' · ' || w.title, p.address_line1 || ', ' || p.postcode, '/jobs/' || w.id
   from public.work_orders w join public.properties p on p.id = w.property_id, q
   where w.tenant_id = p_tenant and (w.reference ilike q.p or w.title ilike q.p or w.client_reference ilike q.p) order by w.reported_at desc limit p_limit)
  union all
  (select 'property', p.id, p.address_line1 || coalesce(', ' || p.address_line2, ''), p.town || ' ' || p.postcode || ' · ' || p.reference, '/properties/' || p.id
   from public.properties p, q
   where p.tenant_id = p_tenant and (p.address_line1 ilike q.p or p.postcode ilike q.p or p.reference ilike q.p or p.uprn ilike q.p) limit p_limit)
  union all
  (select 'client', o.id, o.name, o.reference, '/crm/' || o.id from public.organisations o, q where o.tenant_id = p_tenant and (o.name ilike q.p or o.reference ilike q.p) limit p_limit)
  union all
  (select 'contract', c.id, c.title, c.reference, '/contracts/' || c.id from public.contracts c, q where c.tenant_id = p_tenant and (c.title ilike q.p or c.reference ilike q.p or c.client_reference ilike q.p) limit p_limit)
  union all
  (select 'person', e.id, e.first_name || ' ' || e.last_name, coalesce(e.job_title, e.trade), '/workforce/' || e.id from public.employees e, q where e.tenant_id = p_tenant and (e.first_name || ' ' || e.last_name) ilike q.p limit p_limit)
$$;

-- -------------------------------------------------------------------------------------
-- Scheduling: conflicts and recommendations
-- -------------------------------------------------------------------------------------
create or replace function public.assignment_conflicts(p_employee uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null)
returns table (kind text, ref_id uuid, label text, starts_at timestamptz, ends_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select 'assignment', a.id, w.reference || ' · ' || w.title, a.scheduled_start, a.scheduled_end
  from public.job_assignments a join public.work_orders w on w.id = a.work_order_id
  where a.employee_id = p_employee and a.status not in ('cancelled','completed','no_access')
    and (p_exclude is null or a.id <> p_exclude)
    and tstzrange(a.scheduled_start, a.scheduled_end) && tstzrange(p_start, p_end)
  union all
  select 'absence', x.id, initcap(x.type) || case when x.status = 'requested' then ' (requested)' else '' end, x.starts_at, x.ends_at
  from public.employee_absences x
  where x.employee_id = p_employee and x.status in ('approved','requested') and tstzrange(x.starts_at, x.ends_at) && tstzrange(p_start, p_end)
$$;

-- Ranked operatives for a job and time slot. Every score component is returned so the UI
-- can explain the recommendation (recommendations are advice; a person decides).
create or replace function public.recommend_operatives(p_work_order uuid, p_start timestamptz, p_end timestamptz)
returns table (employee_id uuid, name text, trade text, skills text[], colour text, distance_km numeric, booked_hours_day numeric,
               trade_score integer, availability_score integer, distance_score integer, workload_score integer, total_score integer,
               conflicts integer, reasons text[])
language sql stable security invoker set search_path = '' as $$
  with job as (
    select w.tenant_id, w.trade, w.priority, w.work_category, p.latitude lat, p.longitude lng, p.hazards
    from public.work_orders w join public.properties p on p.id = w.property_id where w.id = p_work_order
  ),
  cand as (
    select e.*, j.trade as job_trade, j.priority, j.hazards,
      case when e.base_latitude is null or j.lat is null then null
           else round((6371 * 2 * asin(sqrt(power(sin(radians((j.lat - e.base_latitude) / 2)), 2)
                 + cos(radians(e.base_latitude)) * cos(radians(j.lat)) * power(sin(radians((j.lng - e.base_longitude) / 2)), 2))))::numeric, 1) end as km,
      (select count(*) from public.assignment_conflicts(e.id, p_start, p_end)) as conflict_count,
      (select coalesce(sum(extract(epoch from (a.scheduled_end - a.scheduled_start)) / 3600), 0) from public.job_assignments a
        where a.employee_id = e.id and a.status <> 'cancelled'
          and (a.scheduled_start at time zone 'Europe/London')::date = (p_start at time zone 'Europe/London')::date) as booked
    from public.employees e, job j
    where e.tenant_id = j.tenant_id and e.employment_status = 'active' and e.is_field_operative
  ),
  scored as (
    select c.*,
      case when c.trade = c.job_trade then 40 when c.trade = 'multi_trade' then 22 when c.job_trade = 'multi_trade' then 18 else 0 end as s_trade,
      case when c.conflict_count = 0 then 30 else -60 end as s_avail,
      case when c.km is null then 8 else greatest(-30, 20 - (c.km / 2.5)::int) end as s_dist,
      greatest(0, 10 - (c.booked)::int) as s_load,
      case when 'asbestos' = any(c.hazards) and not ('asbestos_awareness' = any(c.skills)) then -15 else 0 end as s_safety
    from cand c
  )
  select s.id, s.first_name || ' ' || s.last_name, s.trade, s.skills, s.colour, s.km, round(s.booked::numeric, 1),
         s.s_trade, s.s_avail, s.s_dist, s.s_load, s.s_trade + s.s_avail + s.s_dist + s.s_load + s.s_safety, s.conflict_count::int,
         array_remove(array[
           case when s.s_trade = 40 then 'Trade matches the job' when s.trade = 'multi_trade' then 'Multi-trade cover' when s.job_trade = 'multi_trade' then 'General job: any trade can cover' else 'Different trade' end,
           case when s.conflict_count = 0 then 'Free for this slot' else s.conflict_count || ' clash(es) in this slot' end,
           case when s.km is not null then s.km || ' km from base' end,
           case when s.booked > 0 then round(s.booked::numeric, 1) || ' h already booked that day' else 'No other work that day' end,
           case when 'asbestos' = any(s.hazards) and not ('asbestos_awareness' = any(s.skills)) then 'No asbestos awareness - property has asbestos' end
         ], null)
  from scored s
  order by s.s_trade + s.s_avail + s.s_dist + s.s_load + s.s_safety desc, s.km nulls last
$$;
