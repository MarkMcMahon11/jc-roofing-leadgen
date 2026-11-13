-- =====================================================================================
-- POWERMAC CONNECT - database security tests (pgTAP)
-- Run:  npm run test:db         (local stack)   or   supabase test db   (Supabase CLI)
-- Requires the demo seed (supabase/seed.sql). Everything runs in a transaction and is
-- rolled back.
-- =====================================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(50);

-- Helpers live in a throwaway schema (rolled back with the transaction).
create schema tests;
grant usage on schema tests to authenticated, anon;

-- Act as a signed-in user exactly as PostgREST does (role + JWT claims).
create or replace function tests.login(p_email text) returns void language plpgsql as $$
declare v uuid;
begin
  execute 'reset role';
  select id into v from auth.users where email = p_email;
  if v is null then raise exception 'no such test user %', p_email; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated', 'email', p_email)::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function tests.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
-- run a statement, return the number of rows it affected / its first value
create or replace function tests.affected(p_sql text) returns int language plpgsql as $$
declare n int; begin execute p_sql; get diagnostics n = row_count; return n; end $$;
create or replace function tests.scalar(p_sql text) returns text language plpgsql as $$
declare v text; begin execute p_sql into v; return v; end $$;
grant execute on all functions in schema tests to authenticated, anon;

-- ids looked up with full privileges for the cross-tenant attack below
select set_config('tests.pm_property', (select p.id::text from properties p join tenants t on t.id = p.tenant_id and t.slug = 'powermac-demo' limit 1), true);

-- ---------------------------------------------------------------- structure
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'every public table has row level security enabled');

select is(
  (select count(*)::int from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'),
  0, 'anonymous role has no table privileges at all');

-- ---------------------------------------------------------------- anonymous
set local role anon;
select throws_ok('select count(*) from public.work_orders', '42501', null, 'anonymous users cannot read jobs');
select throws_ok('select count(*) from public.occupants', '42501', null, 'anonymous users cannot read occupants');
select tests.logout();

-- ---------------------------------------------------------------- tenant isolation
select tests.login('director@powermac.test');
select is((select count(*)::int from work_orders where title like 'Northgate job%'), 0, 'PowerMac director cannot see another tenant''s jobs');
select is((select count(distinct tenant_id)::int from properties), 1, 'PowerMac director sees properties from exactly one tenant');
select is((select count(*)::int from tenants), 1, 'PowerMac director sees only their own tenant row');
select ok((select count(*) from work_orders) > 100, 'PowerMac director sees PowerMac jobs');
select ok((select count(*) from invoices) > 0, 'director can read invoices');
select ok((select count(*) from employee_private) > 0, 'director can read employee personal data');

select tests.login('director@northgate.test');
select is((select count(*)::int from work_orders), 5, 'Northgate director sees only Northgate jobs');
select is((select count(*)::int from organisations where name like 'Kelvinbrae%'), 0, 'Northgate director cannot see PowerMac clients');
select is((select count(*)::int from profiles where email = 'office@powermac.test'), 0, 'users cannot look up people in other tenants');

-- composite foreign keys make cross-tenant links impossible even for an authorised writer
select throws_ok(
  $$insert into work_orders (tenant_id, organisation_id, property_id, title)
    select (select id from tenants where slug = 'northgate-demo'), (select id from organisations where name = 'Northgate Lettings Portfolio'),
           current_setting('tests.pm_property')::uuid, 'Cross-tenant link attempt'$$,
  null, null, 'a job cannot point at another tenant''s property');

-- ---------------------------------------------------------------- role scoping (internal roles)
select tests.login('office@powermac.test');
select ok((select count(*) from work_orders) > 100, 'office administrator can read jobs');
select is((select count(*)::int from invoices), 0, 'office administrator cannot read invoices (no finance.read)');
select is((select count(*)::int from costs), 0, 'office administrator cannot read the cost ledger');
select is((select count(*)::int from employee_private), 0, 'office administrator cannot read employee personal data');
select ok((select count(*) from occupants) > 0, 'office administrator can read occupants (occupants.read)');
select throws_ok(
  $$insert into invoices (tenant_id, organisation_id) select tenant_id, id from organisations limit 1$$,
  '42501', null, 'office administrator cannot create invoices');
select throws_ok(
  $$update work_orders set approved_at = now() where reference = 'PM-WO-00001'$$,
  '42501', null, 'approval stamps cannot be written directly');

select tests.login('finance@powermac.test');
select ok((select count(*) from invoices) > 0, 'finance manager can read invoices');
select is((select count(*)::int from occupants), 0, 'finance manager cannot read occupant personal data');

-- ---------------------------------------------------------------- external roles never touch base tables
select tests.login('client@kelvinbrae.test');
select is((select count(*)::int from organisations), 0, 'corporate client cannot read the CRM tables directly');
select is((select count(*)::int from work_orders), 0, 'corporate client reads jobs only through the portal API');
select is((select count(*)::int from invoices), 0, 'corporate client cannot read invoice tables directly');

select tests.login('operative@powermac.test');
select is((select count(*)::int from work_orders), 0, 'field operative reads jobs only through the field API');
select is((select count(*)::int from occupants), 0, 'field operative cannot browse occupants');
select is((select count(*)::int from employee_private), 0, 'field operative cannot read personal data');

select tests.login('subcontractor@powermac.test');
select is((select count(*)::int from properties), 0, 'subcontractor cannot browse properties');

-- ---------------------------------------------------------------- privilege escalation
select tests.login('office@powermac.test');
select is(
  tests.affected($$update memberships set role_id = (select id from roles where key = 'director' and tenant_id = memberships.tenant_id) where user_id = auth.uid()$$),
  0, 'users cannot promote themselves (no users.manage: the update matches nothing)');
select is((select count(*)::int from memberships), 1, 'without users.manage you only see your own membership');

select tests.login('director@powermac.test');
select throws_ok(
  $$update memberships set status = 'suspended' where user_id = auth.uid()$$,
  '42501', null, 'even a director cannot change their own role or status');

select throws_ok(
  $$update profiles set is_platform_admin = true where id = auth.uid()$$,
  '42501', null, 'nobody can make themselves platform admin');

select throws_ok(
  $$update tenants set plan_key = 'enterprise', subscription_status = 'active'$$,
  '42501', null, 'tenants cannot change their own subscription');

-- a user who manages users but lacks finance.write cannot hand it out
select tests.logout();
insert into role_permissions (tenant_id, role_id, permission_key)
select r.tenant_id, r.id, 'users.manage' from roles r join tenants t on t.id = r.tenant_id and t.slug = 'powermac-demo' where r.key = 'office_admin';
select tests.login('office@powermac.test');
select throws_ok(
  $$insert into role_permissions (tenant_id, role_id, permission_key)
    select tenant_id, id, 'finance.write' from roles where key = 'operations_manager'$$,
  '42501', null, 'cannot grant a permission you do not hold');
select throws_ok(
  $$delete from role_permissions where permission_key = 'documents.write' and role_id = (select id from roles where key = 'office_admin')$$,
  '42501', null, 'cannot change the permissions of your own role');
select throws_ok(
  $$update memberships set role_id = (select id from roles where key = 'director') where user_id = (select id from profiles where email = 'ops@powermac.test')$$,
  '42501', null, 'cannot assign a role holding permissions you do not hold');

-- last admin protection
select tests.logout();
set constraints all immediate;
select throws_ok(
  $$update memberships set status = 'suspended'
    where tenant_id = (select id from tenants where slug = 'northgate-demo')$$,
  '23514', null, 'a company always keeps at least one active user manager');

-- ---------------------------------------------------------------- job workflow
select tests.login('office@powermac.test');
select throws_ok(
  $$update work_orders set status = 'approved' where reference = (select min(reference) from work_orders where status = 'new')$$,
  '42501', null, 'approving a job needs work_orders.approve');
select throws_ok(
  $$update work_orders set status = 'completed' where reference = (select min(reference) from work_orders where status = 'new')$$,
  '23514', null, 'the workflow blocks transitions that are not configured');
select lives_ok(
  $$update work_orders set status = 'under_review' where reference = (select min(reference) from work_orders where status = 'new')$$,
  'allowed transitions succeed');
select is(
  (select count(*)::int from job_updates u join work_orders w on w.id = u.work_order_id
   where u.type = 'status_change' and u.to_status = 'under_review' and u.author_id = auth.uid()),
  1, 'status changes are written to the job history with the author');
select throws_ok(
  $$insert into work_orders (tenant_id, organisation_id, property_id, title, status)
    select p.tenant_id, p.organisation_id, p.id, 'Backdated completed job', 'completed' from properties p limit 1$$,
  '23514', null, 'new jobs cannot be created already completed');
select matches(
  tests.scalar($$insert into work_orders (tenant_id, organisation_id, property_id, title)
   select p.tenant_id, p.organisation_id, p.id, 'Reference test job' from properties p limit 1 returning reference$$),
  '^PM-WO-[0-9]{5}$', 'jobs get a per-tenant reference number');

-- ---------------------------------------------------------------- audit & data protection
select tests.login('director@powermac.test');
update organisations set notes = 'Audit test' where name like 'Kelvinbrae%';
update occupants set phone = '07700 900001' where id = (select id from occupants limit 1);
select tests.logout();
select is(
  (select count(*)::int from audit_logs where entity = 'organisations' and action = 'update' and changes ? 'notes'
     and actor_id = (select id from auth.users where email = 'director@powermac.test')),
  1, 'changes are audited with the actor');
select is(
  (select changes->'phone' from audit_logs where entity = 'occupants' and action = 'update' order by id desc limit 1),
  '{"changed": true}'::jsonb, 'occupant personal data is redacted in the audit log');

-- ---------------------------------------------------------------- company erasure (offboarding)
select tests.login('director@powermac.test');
select throws_ok($$select platform_delete_tenant((select id from tenants where slug = 'powermac-demo'), 'powermac-demo')$$, '42501', null, 'a company director cannot erase companies');
select tests.login('admin@bpoai.test');
select lives_ok($$select platform_delete_tenant((select id from tenants where slug = 'northgate-demo'), 'northgate-demo')$$, 'the platform admin can erase a company');
select tests.logout();
select is((select count(*)::int from work_orders where title like 'Northgate job%') + (select count(*)::int from organisations where name like 'Northgate%'), 0, 'all of the erased company''s records are gone');

select * from finish();
rollback;
