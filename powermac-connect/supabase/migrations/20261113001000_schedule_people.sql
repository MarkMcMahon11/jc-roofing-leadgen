-- =====================================================================================
-- POWERMAC CONNECT - 1000 Schedule people (data minimisation)
-- Viewing the schedule needs schedule.read, but the people on it live in workforce tables
-- (workforce.read). Rather than widening a role, the planner gets exactly what it needs:
-- names, trade, colour, working pattern and absence TYPE/STATUS - never notes or personal data.
-- =====================================================================================

create or replace function public.schedule_people(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (p_tenant in (select app.internal_perm_tenants('schedule.read'))) then
    raise exception 'your role does not allow viewing the schedule' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'first_name', e.first_name, 'last_name', e.last_name, 'trade', e.trade, 'colour', e.colour,
        'employment_status', e.employment_status, 'working_hours', e.working_hours, 'max_daily_hours', e.max_daily_hours,
        'skills', e.skills) order by e.last_name, e.first_name)
      from public.employees e
      where e.tenant_id = p_tenant and e.is_field_operative and e.employment_status in ('active','on_leave')), '[]'::jsonb),
    'absences', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'employee_id', x.employee_id, 'type', x.type, 'status', x.status, 'starts_at', x.starts_at, 'ends_at', x.ends_at))
      from public.employee_absences x
      where x.tenant_id = p_tenant and x.status in ('approved','requested') and tstzrange(x.starts_at, x.ends_at) && tstzrange(p_from, p_to)), '[]'::jsonb),
    'subcontractors', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'company_name', s.company_name, 'status', s.status, 'insurance_expiry', s.insurance_expiry) order by s.company_name)
      from public.subcontractors s where s.tenant_id = p_tenant and s.status in ('approved','pending')), '[]'::jsonb)
  );
end $$;
revoke execute on function public.schedule_people(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.schedule_people(uuid, timestamptz, timestamptz) to authenticated;
