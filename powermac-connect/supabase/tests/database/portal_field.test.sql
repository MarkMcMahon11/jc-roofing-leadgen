-- Client portal & field app API: scope isolation and behaviour (pgTAP). Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(18);

create schema tests;
grant usage on schema tests to authenticated, anon;
create or replace function tests.login(p_email text) returns void language plpgsql as $$
declare v uuid;
begin
  execute 'reset role';
  select id into v from auth.users where email = p_email;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated', 'email', p_email)::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on all functions in schema tests to authenticated, anon;

-- fixtures looked up with full privileges
select set_config('t.tenant', (select id::text from tenants where slug = 'powermac-demo'), true);
select set_config('t.kelvinbrae', (select id::text from organisations where name like 'Kelvinbrae%'), true);
select set_config('t.other_job', (select w.id::text from work_orders w join organisations o on o.id = w.organisation_id where o.name like 'Lomond%' limit 1), true);
select set_config('t.own_job', (select w.id::text from work_orders w join organisations o on o.id = w.organisation_id where o.name like 'Kelvinbrae%' limit 1), true);
select set_config('t.kb_property', (select p.id::text from properties p join organisations o on o.id = p.organisation_id where o.name like 'Kelvinbrae%' limit 1), true);
select set_config('t.other_property', (select p.id::text from properties p join organisations o on o.id = p.organisation_id where o.name like 'Lomond%' limit 1), true);
select set_config('t.callum_assignment', (select a.id::text from job_assignments a join employees e on e.id = a.employee_id where e.first_name = 'Callum' and a.status = 'scheduled' order by a.scheduled_start limit 1), true);
select set_config('t.other_assignment', (select a.id::text from job_assignments a join employees e on e.id = a.employee_id where e.first_name <> 'Callum' and a.status = 'scheduled' limit 1), true);

-- ---------------------------------------------------------------- client portal
select tests.login('client@kelvinbrae.test');
select is((select count(distinct property_id)::int from portal_jobs(current_setting('t.tenant')::uuid, false) j
           where property_id not in (select id from portal_properties(current_setting('t.tenant')::uuid))), 0,
  'client only sees jobs at its own properties');
select ok((select count(*) from portal_jobs(current_setting('t.tenant')::uuid, false)) > 0, 'client sees its own jobs');
select is((select portal_overview(current_setting('t.tenant')::uuid)->>'organisation'), 'Kelvinbrae Housing Association', 'portal overview is scoped to the client organisation');
select lives_ok($$select portal_job(current_setting('t.tenant')::uuid, current_setting('t.own_job')::uuid)$$, 'client can open its own job');
select throws_ok($$select portal_job(current_setting('t.tenant')::uuid, current_setting('t.other_job')::uuid)$$, 'P0002', null, 'client cannot open another client''s job');
select throws_ok($$select portal_submit_request(current_setting('t.tenant')::uuid, current_setting('t.other_property')::uuid, 'Leak in kitchen', 'test', 'urgent')$$, 'P0002', null, 'client cannot raise a request for another client''s property');
select ok(
  (select portal_submit_request(current_setting('t.tenant')::uuid, current_setting('t.kb_property')::uuid, 'Leaking radiator valve', 'Water on the floor in bedroom 2', 'urgent', 'KB-TEST-1')) is not null,
  'client can submit a repair request for its own property');
select is((select count(*)::int from portal_jobs(current_setting('t.tenant')::uuid, true, 'KB-TEST-1')), 1, 'the new request appears in the portal');
select is((select count(*)::int from work_orders), 0, 'client still cannot read the jobs table directly');
select throws_ok($$select field_my_jobs(current_setting('t.tenant')::uuid, current_date, current_date)$$, '42501', null, 'client cannot use the field app API');

-- ---------------------------------------------------------------- field app
select tests.login('operative@powermac.test');
select ok((select count(*) from field_my_jobs(current_setting('t.tenant')::uuid, current_date - 7, current_date + 14)) > 0, 'operative sees their assignments');
select is((select count(*)::int from work_orders), 0, 'operative still cannot read the jobs table directly');
select throws_ok($$select field_job(current_setting('t.tenant')::uuid, current_setting('t.other_assignment')::uuid)$$, 'P0002', null, 'operative cannot open someone else''s assignment');
select throws_ok($$select field_update(current_setting('t.tenant')::uuid, current_setting('t.other_assignment')::uuid, 'start')$$, 'P0002', null, 'operative cannot update someone else''s assignment');
select lives_ok($$select field_update(current_setting('t.tenant')::uuid, current_setting('t.callum_assignment')::uuid, 'start', null, 'ref-1')$$, 'operative can start their own job');
select is((select field_update(current_setting('t.tenant')::uuid, current_setting('t.callum_assignment')::uuid, 'start', null, 'ref-1')->>'duplicate'), 'true', 'repeated offline submissions are ignored (idempotent)');
select throws_ok($$select portal_overview(current_setting('t.tenant')::uuid)$$, '42501', null, 'operative cannot use the client portal API');

select tests.login('office@powermac.test');
select throws_ok($$select field_my_jobs(current_setting('t.tenant')::uuid, current_date, current_date)$$, '42501', null, 'office staff use the main app, not the field API');

select * from finish();
rollback;
