-- =====================================================================================
-- POWERMAC CONNECT - DEMO ENVIRONMENT SEED
-- Creates two clearly labelled DEMO tenants (tenants.is_demo = true -> permanent banner in
-- the UI). Every organisation, person, address and figure below is FICTIONAL sample data.
-- Dates are relative to the day the seed runs so the demo always looks current.
--
-- Demo sign-ins (local / demo environments ONLY - never seed a production project):
--   password for all:  Demo-PowerMac-2026!
--   admin@bpoai.test            BPOAI.AI platform super admin
--   director@powermac.test      Company Director
--   ops@powermac.test           Operations Manager
--   contracts@powermac.test     Contract Manager
--   office@powermac.test        Office Administrator
--   finance@powermac.test       Finance Manager
--   operative@powermac.test     Field Operative (linked to employee Callum Reid)
--   subcontractor@powermac.test Subcontractor (Clydeside Electrical Services)
--   client@kelvinbrae.test      Corporate Client (Kelvinbrae Housing Association)
--   director@northgate.test     Director of a SECOND demo tenant (isolation testing)
-- =====================================================================================

select setseed(0.2026);

create schema if not exists seed;
create or replace function seed.r() returns numeric language sql volatile as $$ select random()::numeric $$;
create or replace function seed.pick(a text[]) returns text language sql volatile as $$ select a[1 + floor(seed.r() * array_length(a, 1))::int] $$;
create or replace function seed.rnd(lo numeric, hi numeric) returns numeric language sql volatile as $$ select round(lo + seed.r() * (hi - lo), 2) $$;
create or replace function seed.at_hour(d date, h numeric) returns timestamptz language sql immutable as $$ select (d::timestamp + make_interval(mins => (h * 60)::int)) at time zone 'Europe/London' $$;

-- Books work into an operative's day sequentially from 08:00 (max 8 h/day), so demo data has
-- no accidental double-bookings. Returns the start hour and length, or nulls when the day is full.
create table seed.booked (emp uuid, day date, used numeric, primary key (emp, day));
create or replace function seed.slot(p_emp uuid, p_day date, p_hours numeric, out start_hour numeric, out len numeric) language plpgsql as $$
declare v_used numeric;
begin
  select used into v_used from seed.booked where emp = p_emp and day = p_day;
  v_used := coalesce(v_used, 0);
  len := round(least(p_hours, 8 - v_used) * 4) / 4;
  if len < 1 then start_hour := null; len := null; return; end if;
  insert into seed.booked values (p_emp, p_day, v_used + len) on conflict (emp, day) do update set used = excluded.used;
  start_hour := 8 + v_used;
end $$;
create or replace function seed.weekday(d date, forward boolean default true) returns date language sql immutable as $$
  select case extract(isodow from d)::int when 6 then d + case when forward then 2 else -1 end when 7 then d + case when forward then 1 else -2 end else d end
$$;

create or replace function seed.user(p_email text, p_name text, p_platform boolean default false) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
          extensions.crypt('Demo-PowerMac-2026!', extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());
  update public.profiles set full_name = p_name, is_platform_admin = p_platform where id = v_id;
  return v_id;
end $$;

create or replace function seed.member(p_tenant uuid, p_user uuid, p_role text, p_org uuid default null, p_emp uuid default null, p_sub uuid default null) returns void
language sql as $$
  insert into public.memberships (tenant_id, user_id, role_id, status, organisation_id, employee_id, subcontractor_id, accepted_at, created_by)
  select p_tenant, p_user, r.id, 'active', p_org, p_emp, p_sub, now(), null from public.roles r where r.tenant_id = p_tenant and r.key = p_role;
  update public.profiles set last_tenant_id = p_tenant where id = p_user and last_tenant_id is null;
$$;

do $seed$
declare
  t uuid; t2 uuid;
  u_admin uuid; u_dir uuid; u_ops uuid; u_con uuid; u_off uuid; u_fin uuid; u_opv uuid; u_sub uuid; u_cli uuid; u_n uuid;
  o record; v_org uuid; v_con uuid; v_prop uuid; v_occ uuid; v_emp uuid; v_wo uuid; v_quo uuid; v_inv uuid; v_po uuid; v_sup uuid; v_loc uuid; v_mat uuid; v_veh uuid; v_rc uuid;
  orgs uuid[] := '{}'; contracts uuid[] := '{}'; props uuid[] := '{}'; emps uuid[] := '{}'; subs uuid[] := '{}'; sups uuid[] := '{}'; mats uuid[] := '{}'; locs uuid[] := '{}'; vans uuid[] := '{}';
  i int; j int; n int; d date; h numeric; v_status text; v_pri text; v_cat text; v_trade text; v_title text; v_rep timestamptz; v_due timestamptz; v_hours numeric; v_cost numeric;
  v_start timestamptz; v_end timestamptz; v_done timestamptz; v_amt numeric; v_use_sub boolean; sl record; attempt int;
  streets text[] := array['Rowan Drive','Birch Grove','Thistle Street','Heather Avenue','Burnside Road','Glen Terrace','Mill Lane','Station Road','Park View','Castle Wynd','Hawthorn Court','Kirk Brae','Loch Place','Ashgrove Gardens','Bracken Way','Craigmore Road','Elder Street','Fernbank Avenue','Juniper Close','Moss Side Road'];
  wo_templates text[][] := array[
    array['Leaking kitchen tap','plumbing','plumber'], array['Front door not locking','windows_doors','joiner'], array['Replace failed extractor fan','electrical','electrician'],
    array['Damp and mould in bedroom','damp_mould','plasterer'], array['Slipped slates over bathroom','roofing','roofer'], array['Kitchen unit doors hanging off','joinery','joiner'],
    array['No hot water','heating','gas_engineer'], array['Blocked toilet','plumbing','plumber'], array['Broken window pane - make safe','windows_doors','glazier'],
    array['Install grab rails and level-access shower','adaptations','multi_trade'], array['Full kitchen replacement','kitchens','kitchen_fitter'], array['Bathroom refurbishment','bathrooms','plumber'],
    array['Void property - lettable standard works','void_refurbishment','multi_trade'], array['Re-plaster living room ceiling','plastering','plasterer'], array['Communal stair redecoration','decoration','painter_decorator'],
    array['Rotten fence panels replacement','external_works','joiner'], array['Fire door replacement','windows_doors','joiner'], array['Socket not working','electrical','electrician'],
    array['Gutter clearance and repair','roofing','roofer'], array['Ceiling water ingress - make safe','emergency_makesafe','multi_trade'], array['Skirting and architrave replacement','joinery','joiner'],
    array['Replace radiator valve','heating','plumber'], array['Classroom partition refurbishment','education_refurb','joiner'], array['Shop unit fit-out snagging','commercial_refurb','multi_trade']
  ];
  statuses text[] := array['new','new','under_review','awaiting_survey','awaiting_quotation','awaiting_approval','approved','scheduled','scheduled','in_progress','awaiting_materials','awaiting_inspection','completed','completed','completed','invoiced','invoiced','closed','closed','closed','cancelled'];
begin
  -- ---------------------------------------------------------------- tenants
  insert into public.tenants (name, slug, legal_name, plan_key, subscription_status, seats, is_demo, reference_prefix, vat_number, company_number, settings)
  values ('PowerMac Joinery & Construction', 'powermac-demo', 'PowerMac Joinery & Construction Ltd (DEMO)', 'professional', 'active', 40, true, 'PM', 'GB000000000', 'SC000000',
          '{"labour_rate_default": 42, "overhead_monthly": 3900, "working_day_start": 8, "working_day_end": 17, "brand": "PowerMac Connect"}')
  returning id into t;
  insert into public.tenants (name, slug, plan_key, subscription_status, seats, is_demo, reference_prefix)
  values ('Northgate Property Services', 'northgate-demo', 'trial', 'trial', 10, true, 'NPS') returning id into t2;

  -- ---------------------------------------------------------------- users
  u_admin := seed.user('admin@bpoai.test', 'Platform Admin (BPOAI.AI)', true);
  u_dir := seed.user('director@powermac.test', 'Mark McAllister');
  u_ops := seed.user('ops@powermac.test', 'Fiona Grant');
  u_con := seed.user('contracts@powermac.test', 'Euan Fraser');
  u_off := seed.user('office@powermac.test', 'Kirsty Doyle');
  u_fin := seed.user('finance@powermac.test', 'Graham Watt');
  u_opv := seed.user('operative@powermac.test', 'Callum Reid');
  u_sub := seed.user('subcontractor@powermac.test', 'Ross Kerr');
  u_cli := seed.user('client@kelvinbrae.test', 'Aileen Brodie');
  u_n := seed.user('director@northgate.test', 'Hamish Ure');

  perform seed.member(t, u_dir, 'director');
  perform seed.member(t, u_ops, 'operations_manager');
  perform seed.member(t, u_con, 'contract_manager');
  perform seed.member(t, u_off, 'office_admin');
  perform seed.member(t, u_fin, 'finance_manager');
  perform seed.member(t2, u_n, 'director');

  -- ---------------------------------------------------------------- vehicles & stock locations
  for i in 1..8 loop
    insert into public.vehicles (tenant_id, registration, make, model, vehicle_type, status, mot_due, insurance_due, service_due, created_by)
    values (t, 'SK' || (20 + i) || ' ' || seed.pick(array['PMC','PMJ','PMV']) || i, seed.pick(array['Ford','Vauxhall','Citroen','Renault']), seed.pick(array['Transit Custom','Vivaro','Berlingo','Trafic']),
            'van', case when i = 7 then 'maintenance' else 'active' end, current_date + (i * 17 - 20), current_date + (i * 31), current_date + (i * 11 - 8), u_ops)
    returning id into v_veh;
    vans := vans || v_veh;
  end loop;
  insert into public.stock_locations (tenant_id, name, type) values (t, 'Main Yard - Hillington', 'warehouse') returning id into v_loc; locs := locs || v_loc;
  insert into public.stock_locations (tenant_id, name, type) values (t, 'Edinburgh Depot', 'warehouse') returning id into v_loc; locs := locs || v_loc;
  insert into public.stock_locations (tenant_id, name, type, vehicle_id) values (t, 'Van ' || (select registration from public.vehicles where id = vans[1]), 'van', vans[1]) returning id into v_loc; locs := locs || v_loc;

  -- ---------------------------------------------------------------- employees
  for o in select * from (values
    ('Callum','Reid','joiner','Senior Joiner',array['cscs_card','pasma','asbestos_awareness','fire_door'],'G51 4TZ',55.8610,-4.3290,'#3b82f6',22.50),
    ('Jamie','Docherty','joiner','Joiner',array['cscs_card','working_at_height'],'G52 2BX',55.8520,-4.3520,'#06b6d4',19.50),
    ('Ryan','McLean','joiner','Joiner',array['cscs_card','asbestos_awareness'],'PA1 2BE',55.8456,-4.4239,'#8b5cf6',19.00),
    ('Stuart','Paterson','joiner','Joiner / Kitchen fitter',array['cscs_card','manual_handling'],'EH11 3AF',55.9330,-3.2400,'#14b8a6',20.00),
    ('Liam','Gallacher','plumber','Plumber',array['cscs_card','asbestos_awareness'],'G33 3AA',55.8710,-4.1700,'#0ea5e9',21.00),
    ('Ewan','Baird','plumber','Plumber',array['cscs_card'],'FK1 1AA',56.0019,-3.7839,'#22c55e',20.50),
    ('Scott','Murray','electrician','Electrician',array['cscs_card','bs7671','ipaf'],'G41 1AA',55.8350,-4.2850,'#f59e0b',23.00),
    ('Daniel','Hughes','electrician','Electrician',array['cscs_card','bs7671'],'EH7 5AA',55.9600,-3.1700,'#eab308',22.50),
    ('Craig','Stewart','roofer','Roofer',array['cscs_card','working_at_height','ipaf'],'G69 6AA',55.8700,-4.0900,'#ef4444',21.50),
    ('Kevin','Anderson','plasterer','Plasterer',array['cscs_card'],'G81 1AA',55.9020,-4.4040,'#f97316',19.50),
    ('Mark','Robertson','painter_decorator','Painter & decorator',array['cscs_card','pasma'],'G20 7AA',55.8830,-4.2800,'#ec4899',18.50),
    ('Sean','Kelly','multi_trade','Multi-trade operative',array['cscs_card','disabled_adaptations','asbestos_awareness'],'DD3 6AA',56.4700,-3.0100,'#a855f7',19.00),
    ('Andrew','Wilson','multi_trade','Multi-trade operative',array['cscs_card','disabled_adaptations'],'FK8 1AA',56.1165,-3.9369,'#6366f1',19.00),
    ('Gary','Campbell','gas_engineer','Gas engineer',array['cscs_card','gas_safe'],'G73 1AA',55.8200,-4.2100,'#10b981',24.00)
  ) as x(fn, ln, trade, title, skills, pc, lat, lng, col, cost) loop
    n := array_length(emps, 1);
    insert into public.employees (tenant_id, first_name, last_name, job_title, trade, skills, work_email, work_phone, employment_status, employment_type, start_date,
                                  charge_rate, base_postcode, base_latitude, base_longitude, vehicle_id, colour, created_by)
    values (t, o.fn, o.ln, o.title, o.trade, o.skills, lower(o.fn || '.' || o.ln) || '@powermac.test', '07700 9' || lpad((100 + coalesce(n,0) * 37)::text, 5, '0'),
            case when o.ln = 'Wilson' then 'on_leave' else 'active' end, case when o.ln = 'Kelly' then 'apprentice' else 'full_time' end,
            current_date - (365 * (1 + floor(seed.r() * 8)))::int, round(o.cost * 1.9, 2), o.pc, o.lat, o.lng, vans[1 + (coalesce(n, 0) % 8)], o.col, u_ops)
    returning id into v_emp;
    emps := emps || v_emp;
    insert into public.employee_private (employee_id, tenant_id, date_of_birth, home_address, emergency_contact_name, emergency_contact_phone, hourly_cost)
    values (v_emp, t, current_date - (365 * (22 + floor(seed.r() * 30)))::int, (10 + floor(seed.r() * 80)) || ' ' || seed.pick(streets) || ', ' || o.pc, 'Next of kin (demo)', '07700 900' || (100 + floor(seed.r()*800)), o.cost);
    insert into public.qualifications (tenant_id, employee_id, name, issuer, issued_on, expires_on)
    values (t, v_emp, 'CSCS Skilled Worker card', 'CITB', current_date - 900, current_date + (floor(seed.r() * 600) - 40)::int);
    if 'asbestos_awareness' = any(o.skills) then
      insert into public.qualifications (tenant_id, employee_id, name, issuer, issued_on, expires_on)
      values (t, v_emp, 'Asbestos awareness (UKATA)', 'UKATA', current_date - 330, current_date + (floor(seed.r() * 60) + 5)::int);
    end if;
    if 'gas_safe' = any(o.skills) then
      insert into public.qualifications (tenant_id, employee_id, name, issuer, certificate_number, issued_on, expires_on)
      values (t, v_emp, 'Gas Safe registration', 'Gas Safe Register', '000000', current_date - 200, current_date + 165);
    end if;
  end loop;
  update public.employees set user_id = u_opv where id = emps[1];
  perform seed.member(t, u_opv, 'field_operative', null, emps[1]);
  update public.employees set employment_status = 'on_leave' where id = emps[13];
  insert into public.employee_absences (tenant_id, employee_id, type, starts_at, ends_at, status, created_by)
  values (t, emps[13], 'holiday', seed.at_hour(current_date - 2, 0), seed.at_hour(current_date + 5, 23.99), 'approved', u_ops),
         (t, emps[6], 'training', seed.at_hour(current_date + 3, 8), seed.at_hour(current_date + 3, 17), 'approved', u_ops),
         (t, emps[9], 'holiday', seed.at_hour(current_date + 9, 0), seed.at_hour(current_date + 13, 23.99), 'requested', u_ops);

  -- ---------------------------------------------------------------- subcontractors
  for o in select * from (values
    ('Clydeside Electrical Services','Ross Kerr',array['electrician'],'approved',current_date + 210, 5000000, 'gross', 320, 4.6),
    ('Bonnie Roofing Ltd','Shona Bell',array['roofer'],'approved',current_date + 24, 2000000, 'net', 290, 4.2),
    ('Forth Flooring Co','Neil Shaw',array['flooring','tiler'],'approved',current_date + 120, 2000000, 'net', 260, 4.4),
    ('Ace Scaffold Scotland','Iain Muir',array['labourer'],'pending',current_date - 6, 5000000, 'unverified', 450, null)
  ) as x(cn, contact, trades, st, ins, pl, cis, rate, rating) loop
    insert into public.subcontractors (tenant_id, company_name, contact_name, email, phone, trades, status, insurance_expiry, public_liability_gbp, cis_status, day_rate, rating, created_by)
    values (t, o.cn, o.contact, lower(split_part(o.contact,' ',1)) || '@' || lower(replace(split_part(o.cn,' ',1),' ','')) || '.test', '0141 496 0' || (100 + floor(seed.r()*800)),
            o.trades, o.st, o.ins, o.pl, o.cis, o.rate, o.rating, u_ops)
    returning id into v_emp;
    subs := subs || v_emp;
  end loop;
  perform seed.member(t, u_sub, 'subcontractor', null, null, subs[1]);

  -- ---------------------------------------------------------------- suppliers & materials
  for o in select * from (values
    ('Caledonian Timber Supplies','orders@caledoniantimber.test','0141 496 0201','CTS-44120',array['timber','sheet materials','ironmongery']),
    ('Highland Plumbing & Heating Merchants','sales@highlandplumbing.test','0141 496 0202','HPH-9031',array['plumbing','heating']),
    ('Saltire Building Supplies','trade@saltirebuilding.test','0131 496 0203','SBS-21877',array['building','plaster','roofing']),
    ('Northern Electrical Wholesale','counter@northernelec.test','0141 496 0204','NEW-55102',array['electrical']),
    ('Glenmore Kitchens & Bathrooms','projects@glenmorekb.test','01324 496 205','GKB-7781',array['kitchens','bathrooms'])
  ) as x(nm, em, ph, acc, cats) loop
    insert into public.suppliers (tenant_id, name, email, orders_email, phone, account_number, payment_terms_days, categories, delivery_info, rating, created_by)
    values (t, o.nm, o.em, o.em, o.ph, o.acc, 30, o.cats, 'Next-day delivery to site before 10:00 when ordered by 15:00', seed.rnd(3.6, 4.9), u_fin)
    returning id into v_sup;
    sups := sups || v_sup;
  end loop;

  for o in select * from (values
    ('TIM-001','Softwood 47x100 C24 (4.8m)','timber','length',1,9.85),('TIM-002','Softwood 38x63 CLS (2.4m)','timber','length',1,3.20),('TIM-010','18mm WBP plywood 2440x1220','timber','sheet',1,38.50),
    ('TIM-020','Torus skirting 119mm MDF (4.4m)','timber','length',1,11.40),('TIM-021','Architrave set 69mm','timber','set',1,14.20),('DOR-001','FD30 fire door 826mm','doors','each',1,148.00),
    ('DOR-002','Internal door 762mm 4-panel','doors','each',1,54.00),('IRN-001','Euro cylinder 35/35 anti-snap','ironmongery','each',1,18.90),('IRN-002','Door closer overhead EN3','ironmongery','each',1,42.00),
    ('PLB-001','15mm copper pipe (3m)','plumbing','length',2,16.80),('PLB-002','Mixer tap - kitchen mono','plumbing','each',2,46.50),('PLB-003','Thermostatic radiator valve','plumbing','pair',2,19.75),
    ('PLB-004','Close-coupled WC pack','plumbing','each',2,129.00),('PLB-005','Level-access shower tray 1200x800','plumbing','each',5,365.00),('HTG-001','Combi boiler 30kW','heating','each',2,1180.00),
    ('BLD-001','Multi-finish plaster 25kg','plaster','bag',3,9.40),('BLD-002','Plasterboard 12.5mm 2400x1200','plaster','sheet',3,8.90),('BLD-003','Anti-mould paint 5L','decoration','each',3,32.00),
    ('ROF-001','Natural slate 500x250','roofing','each',3,2.85),('ROF-002','Lead flashing code 4 (3m)','roofing','roll',3,84.00),('ROF-003','PVC gutter 112mm (4m)','roofing','length',3,12.60),
    ('ELE-001','Double socket 13A','electrical','each',4,4.10),('ELE-002','Extractor fan 100mm humidistat','electrical','each',4,38.00),('ELE-003','Twin & earth 2.5mm (100m)','electrical','roll',4,72.00),
    ('ELE-004','Smoke/heat alarm interlinked','electrical','each',4,29.50),('KIT-001','Kitchen base unit 600 (rigid)','kitchens','each',5,96.00),('KIT-002','Laminate worktop 3m','kitchens','length',5,88.00),
    ('BTH-001','Grab rail 600mm stainless','bathrooms','each',5,24.00),('BTH-002','Wet-room vinyl flooring per m2','bathrooms','m2',5,31.00),('GEN-001','Dust sheets & protection pack','general','pack',3,12.50)
  ) as x(sku, nm, cat, unit, sup, cost) loop
    insert into public.materials (tenant_id, sku, name, category, unit, default_supplier_id, unit_cost, sell_price, is_stock_item, reorder_level, reorder_quantity, created_by)
    values (t, o.sku, o.nm, o.cat, o.unit, sups[o.sup], o.cost, round(o.cost * 1.25, 2), o.cost < 200, case when o.cost < 200 then 10 end, case when o.cost < 200 then 40 end, u_fin)
    returning id into v_mat;
    mats := mats || v_mat;
    insert into public.supplier_prices (tenant_id, supplier_id, material_id, supplier_sku, unit_price, lead_time_days)
    values (t, sups[o.sup], v_mat, o.sku || '-S', o.cost, 1 + floor(seed.r() * 4));
    if o.sup <> 3 then
      insert into public.supplier_prices (tenant_id, supplier_id, material_id, supplier_sku, unit_price, lead_time_days)
      values (t, sups[3], v_mat, 'SBS-' || o.sku, round(o.cost * seed.rnd(0.94, 1.12), 2), 2 + floor(seed.r() * 5));
    end if;
    if o.cost < 200 then
      insert into public.stock_movements (tenant_id, material_id, location_id, quantity, movement_type, unit_cost, notes)
      values (t, v_mat, locs[1], case when o.sku in ('TIM-020','PLB-002','ELE-002','BLD-001') then 4 else 20 + floor(seed.r() * 60) end, 'receipt', o.cost, 'Opening stock (demo)');
    end if;
  end loop;

  -- rate card (labour rates used by estimating / AI draft quotes)
  select id into v_rc from public.rate_cards where tenant_id = t and is_default;
  insert into public.rate_card_items (tenant_id, rate_card_id, code, description, trade, unit, rate, labour_hours, material_cost) values
    (t, v_rc, 'LAB-JNR', 'Joiner - per hour', 'joiner', 'hour', 42.00, 1, 0), (t, v_rc, 'LAB-PLB', 'Plumber - per hour', 'plumber', 'hour', 44.00, 1, 0),
    (t, v_rc, 'LAB-ELE', 'Electrician - per hour', 'electrician', 'hour', 46.00, 1, 0), (t, v_rc, 'LAB-GAS', 'Gas engineer - per hour', 'gas_engineer', 'hour', 52.00, 1, 0),
    (t, v_rc, 'LAB-ROF', 'Roofer - per hour', 'roofer', 'hour', 44.00, 1, 0), (t, v_rc, 'LAB-PLS', 'Plasterer - per hour', 'plasterer', 'hour', 40.00, 1, 0),
    (t, v_rc, 'LAB-DEC', 'Painter & decorator - per hour', 'painter_decorator', 'hour', 36.00, 1, 0), (t, v_rc, 'LAB-MTO', 'Multi-trade operative - per hour', 'multi_trade', 'hour', 38.00, 1, 0),
    (t, v_rc, 'SOR-DR01', 'Supply and fit FD30 fire door incl. ironmongery', 'joiner', 'each', 420.00, 4, 210.00),
    (t, v_rc, 'SOR-KT01', 'Replace kitchen mixer tap', 'plumber', 'each', 135.00, 1.5, 46.50),
    (t, v_rc, 'SOR-EF01', 'Replace bathroom extractor fan (like for like)', 'electrician', 'each', 160.00, 2, 38.00),
    (t, v_rc, 'SOR-RF01', 'Replace up to 10 slipped slates (access by ladder)', 'roofer', 'item', 240.00, 3, 30.00),
    (t, v_rc, 'SOR-AD01', 'Fit grab rail (each)', 'multi_trade', 'each', 65.00, 0.75, 24.00),
    (t, v_rc, 'SOR-MD01', 'Mould wash and anti-mould redecoration per room', 'painter_decorator', 'room', 185.00, 4, 32.00),
    (t, v_rc, 'CALL-OUT', 'Emergency call-out (out of hours)', 'multi_trade', 'each', 95.00, 1, 0);

  -- ---------------------------------------------------------------- client organisations
  for o in select * from (values
    ('Kelvinbrae Housing Association','housing_association','active','Glasgow','G12',55.8790,-4.2950, 6200000, 'kelvinbrae'),
    ('Lomond Vale Homes','housing_association','active','Dumbarton','G82',55.9432,-4.5701, 2100000, 'lomondvale'),
    ('Carronvale District Council - Housing Services','local_authority','active','Falkirk','FK1',56.0019,-3.7839, 3600000, 'carronvale'),
    ('Strathcairn Property Management','property_manager','active','Edinburgh','EH7',55.9590,-3.1750, 400000, 'strathcairn'),
    ('Tayview Learning Estates','education','active','Dundee','DD2',56.4620,-2.9707, 900000, 'tayview'),
    ('Clydegate Retail Parks Ltd','commercial','active','Paisley','PA3',55.8456,-4.4239, 500000, 'clydegate'),
    ('Ochil Homes Co-operative','housing_association','prospect','Stirling','FK8',56.1165,-3.9369, 0, 'ochilhomes'),
    ('Meadowbank Care Group','healthcare','prospect','Edinburgh','EH8',55.9500,-3.1600, 0, 'meadowbankcare')
  ) as x(nm, cat, st, town, pc, lat, lng, val, dom) loop
    insert into public.organisations (tenant_id, name, category, status, email, phone, address_line1, town, postcode, account_manager_id, contract_manager_id, payment_terms_days, portal_enabled, tags, created_by)
    values (t, o.nm, o.cat, o.st, 'repairs@' || o.dom || '.test', '0' || (1300 + floor(seed.r() * 600)) || ' 496 ' || (100 + floor(seed.r()*800)),
            (1 + floor(seed.r() * 40)) || ' ' || seed.pick(array['Business Park','Exchange Place','Riverside House','Quay Street','Centre Court']), o.town, o.pc || ' ' || (1 + floor(seed.r()*9)) || seed.pick(array['AB','DF','HJ','LN','PQ']),
            u_dir, u_con, case when o.cat = 'local_authority' then 30 else 30 end, o.dom = 'kelvinbrae', case when o.st = 'prospect' then array['pipeline'] else array['framework'] end, u_con)
    returning id into v_org;
    orgs := orgs || v_org;
    insert into public.contacts (tenant_id, organisation_id, first_name, last_name, job_title, email, phone, is_primary, is_billing, created_by) values
      (t, v_org, seed.pick(array['Aileen','Moira','Lorna','Gillian','Shona','Catriona']), seed.pick(array['Brodie','Mackay','Ferguson','Henderson','Sinclair','Rennie']), 'Asset Manager', 'asset.manager@' || o.dom || '.test', '0141 496 0' || (300 + floor(seed.r()*600)), true, false, u_con),
      (t, v_org, seed.pick(array['Douglas','Alasdair','Neil','Kenneth','Ruaridh']), seed.pick(array['Munro','Gordon','Lindsay','Cameron','Forsyth']), 'Repairs Coordinator', 'repairs.coordinator@' || o.dom || '.test', '0141 496 0' || (300 + floor(seed.r()*600)), false, false, u_con),
      (t, v_org, seed.pick(array['Elaine','Morag','Heather']), seed.pick(array['Wallace','Hamilton','Kerr']), 'Finance Officer', 'accounts@' || o.dom || '.test', null, false, true, u_fin);
  end loop;
  update public.contacts set first_name = 'Aileen', last_name = 'Brodie' where organisation_id = orgs[1] and is_primary;
  perform seed.member(t, u_cli, 'client_user', orgs[1]);
  insert into public.intake_senders (tenant_id, organisation_id, email_pattern) values (t, orgs[1], '*@kelvinbrae.test'), (t, orgs[2], '*@lomondvale.test'), (t, orgs[3], '*@carronvale.test');

  -- ---------------------------------------------------------------- contracts
  for o in select * from (values
    (1,'Responsive Repairs & Maintenance 2025-2028','responsive_repairs','active',2400000,800000,-420,675,'schedule_of_rates',5),
    (1,'Void Refurbishment Programme','void_refurbishment','active',850000,425000,-210,155,'schedule_of_rates',0),
    (2,'Planned Kitchen & Bathroom Replacement','planned_maintenance','active',1200000,600000,-300,430,'fixed_price',3),
    (2,'Medical Adaptations Framework','adaptations','active',300000,150000,-640,46,'schedule_of_rates',0),
    (3,'Housing Term Maintenance Contract','term_maintenance','active',1600000,530000,-1025,70,'schedule_of_rates',5),
    (4,'Responsive Repairs - Managed Portfolio','responsive_repairs','active',180000,90000,-150,580,'day_rate',0),
    (5,'Summer Works Programme 2026','capital_works','completed',640000,640000,-160,-60,'fixed_price',3),
    (6,'Retail Unit Refurbishment Framework','framework','active',420000,210000,-95,270,'mixed',2.5)
  ) as x(org, title, ctype, st, val, budget, s_off, e_off, basis, ret) loop
    insert into public.contracts (tenant_id, organisation_id, title, contract_type, scope_of_work, status, value, annual_budget, start_date, end_date, renewal_date, notice_period_days,
                                  payment_terms_days, retention_percent, pricing_basis, contract_manager_id, client_contact_id, created_by)
    values (t, orgs[o.org], o.title, o.ctype,
            'Delivery of ' || lower(o.title) || ' across the client''s portfolio in line with the agreed specification, schedule of rates and service levels.',
            o.st, o.val, o.budget, current_date + o.s_off, current_date + o.e_off, current_date + o.e_off - 90, 90, 30, o.ret, o.basis, u_con,
            (select id from public.contacts where organisation_id = orgs[o.org] and is_primary), u_con)
    returning id into v_con;
    contracts := contracts || v_con;
    insert into public.contract_slas (tenant_id, contract_id, priority, response_hours, attend_hours, complete_hours, description) values
      (t, v_con, 'emergency', 1, 4, 24, 'Make safe within 4 hours'), (t, v_con, 'urgent', 4, 24, 120, 'Attend within 24 hours'),
      (t, v_con, 'routine', 24, 168, 672, 'Complete within 28 days'), (t, v_con, 'planned', 72, 720, 2160, 'Programmed works');
    insert into public.contract_kpis (tenant_id, contract_id, name, metric_key, target_value, unit, direction) values
      (t, v_con, 'Jobs completed on time', 'on_time_completion', 95, '%', 'higher_better'),
      (t, v_con, 'First-time fix rate', 'first_time_fix', 85, '%', 'higher_better'),
      (t, v_con, 'Customer satisfaction', 'customer_satisfaction', 4.5, '/5', 'higher_better');
  end loop;
  insert into public.contract_variations (tenant_id, contract_id, title, description, value, status, approved_by, approved_at, created_by) values
    (t, contracts[1], 'Additional damp & mould response resource', 'Second dedicated mould team for winter period', 48000, 'approved', u_dir, now() - interval '40 days', u_con),
    (t, contracts[3], 'Upgraded worktops (client request)', 'Upgrade from 28mm to 38mm laminate worktops across phase 2', 14250, 'proposed', null, null, u_con),
    (t, contracts[5], 'Out-of-hours emergency cover extension', 'Weekend cover extended to bank holidays', 9600, 'approved', u_dir, now() - interval '120 days', u_con);

  -- ---------------------------------------------------------------- properties & occupants
  for i in 1..84 loop
    j := case when i <= 30 then 1 when i <= 44 then 2 when i <= 62 then 3 when i <= 70 then 4 when i <= 76 then 5 when i <= 80 then 6 else 1 end;
    select town, postcode, lat, lng into o from (values
      (1,'Glasgow','G',55.8642,-4.2700),(2,'Dumbarton','G82',55.9432,-4.5701),(3,'Falkirk','FK',56.0019,-3.7839),(4,'Edinburgh','EH',55.9533,-3.1883),(5,'Dundee','DD',56.4620,-2.9707),(6,'Paisley','PA',55.8456,-4.4239)
    ) as x(k, town, postcode, lat, lng) where k = j;
    insert into public.properties (tenant_id, organisation_id, uprn, address_line1, address_line2, town, postcode, latitude, longitude, property_type, tenure, status, bedrooms, build_year,
                                   access_notes, restrictions, hazards, created_by)
    values (t, orgs[j], (906700000000 + i * 137)::text,
            case when j = 5 then seed.pick(array['Hillcrest Primary School','Riverside High School','Braeview Primary School','Northfield Community Campus'])
                 when j = 6 then 'Unit ' || (1 + floor(seed.r() * 24)) || ', Clydegate Retail Park'
                 else (1 + floor(seed.r() * 120)) || ' ' || seed.pick(streets) end,
            case when j in (1,3) and seed.r() < 0.4 then 'Flat ' || (1 + floor(seed.r()*3)) || '/' || (1 + floor(seed.r()*2)) end,
            o.town,
            case when j = 1 then 'G' || (11 + floor(seed.r() * 42)) when j = 2 then 'G82' when j = 3 then 'FK' || (1 + floor(seed.r() * 6)) when j = 4 then 'EH' || (4 + floor(seed.r() * 14)) when j = 5 then 'DD' || (1 + floor(seed.r() * 5)) else 'PA' || (1 + floor(seed.r() * 3)) end
              || ' ' || (1 + floor(seed.r() * 9)) || seed.pick(array['AB','BD','DE','EF','HJ','LN','PR','SU','TW','XY']),
            round((o.lat + (seed.r() - 0.5) * 0.09)::numeric, 6), round((o.lng + (seed.r() - 0.5) * 0.15)::numeric, 6),
            case when j = 5 then 'school' when j = 6 then 'commercial_unit' else seed.pick(array['house','flat','tenement_flat','cottage_flat','maisonette','bungalow','sheltered']) end,
            case when j = 5 then 'education' when j = 6 then 'commercial' when j = 4 then 'private_rent' else 'social_rent' end,
            case when i % 13 = 0 then 'void' when i % 17 = 0 then 'under_works' else 'occupied' end,
            case when j in (5,6) then null else 1 + floor(seed.r() * 4) end,
            1890 + floor(seed.r() * 130),
            case when seed.r() < 0.35 then seed.pick(array['Call occupant 30 minutes before arrival','Key holder: concierge desk','Dog on premises - occupant will secure','Access via rear lane only','Parking permit required - collect from office']) end,
            case when seed.r() < 0.2 then seed.pick(array['Asbestos register: textured ceiling coating present','Conservation area - like-for-like materials only','Listed building - consult before external works']) end,
            case when seed.r() < 0.15 then array['asbestos'] when seed.r() < 0.1 then array['working_at_height'] else '{}' end,
            u_off)
    returning id into v_prop;
    props := props || v_prop;
    insert into public.contract_properties (tenant_id, contract_id, property_id)
    select t, c.id, v_prop from public.contracts c where c.organisation_id = orgs[j] and (c.contract_type <> 'void_refurbishment' or i % 13 = 0);
    if j <= 4 and i % 13 <> 0 then
      insert into public.occupants (tenant_id, property_id, full_name, phone, email, preferred_contact, move_in_date, access_needs, vulnerability_flags, created_by)
      values (t, v_prop, seed.pick(array['Mrs','Mr','Ms','Mx']) || ' ' || seed.pick(array['A.','J.','M.','S.','K.','R.','L.']) || ' ' || seed.pick(array['Campbell','MacDonald','Smith','Brown','Wilson','Thomson','Robertson','Clark','Ross','Young','Mitchell','Watson']),
              '07700 9' || lpad((floor(seed.r() * 99999))::text, 5, '0'), case when seed.r() < 0.5 then 'occupant' || i || '@example.test' end,
              seed.pick(array['phone','phone','sms','email','via_client']), current_date - (floor(seed.r() * 4000))::int,
              case when seed.r() < 0.15 then seed.pick(array['Please allow extra time at the door','Prefers morning appointments','Interpreter may be needed (Polish)']) end,
              case when seed.r() < 0.12 then array[seed.pick(array['mobility','hearing','elderly','language'])] else '{}' end, u_off);
    end if;
  end loop;

  -- ---------------------------------------------------------------- work orders
  for i in 1..190 loop
    v_prop := props[1 + floor(seed.r() * array_length(props, 1))::int];
    select p.organisation_id into v_org from public.properties p where p.id = v_prop;
    select c.id into v_con from public.contracts c where c.organisation_id = v_org and c.status in ('active','completed') order by seed.r() limit 1;
    n := 1 + floor(seed.r() * array_length(wo_templates, 1))::int;
    v_title := wo_templates[n][1]; v_cat := wo_templates[n][2]; v_trade := wo_templates[n][3];
    if v_org = orgs[5] then v_title := wo_templates[23][1]; v_cat := 'education_refurb'; v_trade := 'joiner'; end if;
    if v_org = orgs[6] then v_title := wo_templates[24][1]; v_cat := 'commercial_refurb'; v_trade := 'multi_trade'; end if;
    v_pri := case when v_cat = 'emergency_makesafe' or v_title like '%make safe%' then 'emergency' when seed.r() < 0.18 then 'urgent' when v_cat in ('kitchens','bathrooms','void_refurbishment','education_refurb','commercial_refurb') then 'planned' else 'routine' end;
    v_status := statuses[1 + floor(seed.r() * array_length(statuses, 1))::int];
    -- age by status: closed/invoiced are older, open newer
    v_rep := now() - make_interval(days => case
      when v_status = 'invoiced' then 6 + floor(seed.r() * 30)::int
      when v_status in ('closed','cancelled') then 25 + floor(seed.r() * 120)::int
      when v_status = 'completed' then 3 + floor(seed.r() * 20)::int
      when v_status in ('new','under_review') then floor(seed.r() * 3)::int
      else 2 + floor(seed.r() * 25)::int end, hours => floor(seed.r() * 9)::int);
    v_due := v_rep + case v_pri when 'emergency' then interval '24 hours' when 'urgent' then interval '5 days' when 'routine' then interval '28 days' else interval '60 days' end;
    v_hours := case v_pri when 'planned' then seed.rnd(16, 60) else seed.rnd(1, 8) end;
    insert into public.work_orders (tenant_id, organisation_id, contract_id, property_id, occupant_id, title, description, work_category, trade, priority, status, source,
                                    reported_at, target_attend_at, target_completion_at, estimated_hours, estimated_cost, requires_approval, manager_id, client_reference, created_at, created_by)
    values (t, v_org, v_con, v_prop, (select id from public.occupants where property_id = v_prop and is_current limit 1),
            v_title, v_title || '. Reported by ' || seed.pick(array['occupant via client repairs line','client asset team','PowerMac stock condition survey','client email']) || '. Please attend, assess and complete repair to the contract specification.',
            v_cat, v_trade, v_pri, v_status, seed.pick(array['email','email','phone','portal','api','manual']),
            v_rep, v_rep + case v_pri when 'emergency' then interval '4 hours' when 'urgent' then interval '24 hours' else interval '7 days' end, v_due,
            v_hours, round(v_hours * 42 + seed.rnd(20, 600), 2), v_pri = 'planned' or v_status in ('awaiting_approval'), case when seed.r() < 0.6 then u_ops else u_con end,
            case when seed.r() < 0.7 then 'CL-' || (40000 + floor(seed.r() * 9999)) end, v_rep, u_off)
    returning id into v_wo;

    -- finished jobs: actuals, assignments, timesheets, materials, satisfaction
    if v_status in ('completed','invoiced','closed') then
      -- a past weekday after the report, in a free slot of some operative's day
      d := seed.weekday((v_rep at time zone 'Europe/London')::date + 1 + floor(seed.r() * 3)::int);
      if d > current_date - 1 then d := seed.weekday(current_date - 1, false); end if;
      for attempt in 1..40 loop
        v_emp := emps[1 + floor(seed.r() * 12)::int];
        sl := seed.slot(v_emp, d, v_hours);
        exit when sl.start_hour is not null;
        if attempt % 12 = 0 then d := seed.weekday(d - 1, false); end if;
      end loop;
      v_start := seed.at_hour(d, sl.start_hour);
      -- multi-day works finish on a later day; the booking covers the first day
      v_done := v_start + make_interval(mins => (sl.len * 60)::int) + make_interval(days => greatest(ceil(v_hours / 8)::int - 1, 0));
      if v_done > now() then v_done := now() - interval '2 hours'; end if;
      update public.work_orders set actual_start = v_start, actual_end = v_done, completed_at = v_done,
             closed_at = case when v_status = 'closed' then v_done + interval '5 days' end,
             first_time_fix = seed.r() < 0.84, satisfaction_score = case when seed.r() < 0.7 then 3 + floor(seed.r() * 3)::int end,
             signoff_name = 'Occupant (demo)', signoff_at = v_done, completion_notes = 'Works completed as instructed. Area left clean and tidy.'
      where id = v_wo;
      insert into public.job_assignments (tenant_id, work_order_id, employee_id, scheduled_start, scheduled_end, status, arrived_at, started_at, finished_at)
      values (t, v_wo, v_emp, v_start, v_start + make_interval(mins => (sl.len * 60)::int), 'completed', v_start - interval '10 minutes', v_start, v_done);
      -- one timesheet per working day (max 8h each)
      for j in 0..(ceil(v_hours / 8) - 1)::int loop
        insert into public.timesheets (tenant_id, employee_id, work_order_id, work_date, hours, entry_type, status, approved_by, approved_at)
        values (t, v_emp, v_wo, (v_start at time zone 'Europe/London')::date + j, greatest(round(least(8, v_hours - j * 8), 2), 0.5), 'labour', 'approved', u_ops, v_done + interval '1 day');
      end loop;
      v_mat := mats[1 + floor(seed.r() * array_length(mats, 1))::int];
      insert into public.job_materials (tenant_id, work_order_id, material_id, description, quantity, unit, unit_cost, status)
      select t, v_wo, m.id, m.name, 1 + floor(seed.r() * 4), m.unit, m.unit_cost, 'used' from public.materials m where m.id = v_mat;
      insert into public.costs (tenant_id, work_order_id, category, description, amount, vat_amount, incurred_on, supplier_id, source)
      select t, v_wo, 'materials', 'Materials: ' || m.name, round(m.unit_cost * (1 + floor(seed.r() * 4)), 2), 0, (v_start at time zone 'Europe/London')::date, m.default_supplier_id, 'stock_issue'
      from public.materials m where m.id = v_mat;
      if v_pri = 'planned' then
        insert into public.costs (tenant_id, work_order_id, category, description, amount, incurred_on, supplier_id, source)
        values (t, v_wo, 'materials', 'Materials package', seed.rnd(600, 3400), (v_start at time zone 'Europe/London')::date, sups[5], 'purchase_order');
      end if;
      if seed.r() < 0.12 then
        insert into public.costs (tenant_id, work_order_id, category, description, amount, incurred_on, subcontractor_id, source)
        values (t, v_wo, 'subcontractor', 'Subcontract works', seed.rnd(180, 1400), (v_start at time zone 'Europe/London')::date, subs[1 + floor(seed.r() * 3)::int], 'manual');
      end if;
    elsif v_status in ('scheduled','in_progress','awaiting_inspection','awaiting_materials') then
      -- Callum (emps[1], the demo field user) gets a planned day below; others are booked into free slots
      d := seed.weekday(case when v_status = 'scheduled' then current_date + floor(seed.r() * 12)::int else current_date - floor(seed.r() * 2)::int end);
      for attempt in 1..40 loop
        v_emp := emps[2 + floor(seed.r() * 11)::int];
        sl := seed.slot(v_emp, d, v_hours);
        exit when sl.start_hour is not null;
        if attempt % 11 = 0 then d := seed.weekday(d + 1); end if;
      end loop;
      v_start := seed.at_hour(d, sl.start_hour);
      v_end := v_start + make_interval(mins => (sl.len * 60)::int);
      v_use_sub := v_trade in ('electrician','roofer') and seed.r() < 0.6;
      insert into public.job_assignments (tenant_id, work_order_id, employee_id, subcontractor_id, scheduled_start, scheduled_end, status, arrived_at, started_at)
      values (t, v_wo, case when v_use_sub then null else v_emp end,
              case when v_use_sub then case when v_trade = 'electrician' then subs[1] else subs[2] end end, v_start, v_end,
              case when v_status = 'in_progress' then 'on_site' when v_status = 'scheduled' then 'scheduled' else 'paused' end,
              case when v_status <> 'scheduled' then v_start end, case when v_status <> 'scheduled' then v_start + interval '5 minutes' end);
      if v_status <> 'scheduled' then update public.work_orders set actual_start = v_start where id = v_wo; end if;
      if v_status = 'awaiting_materials' then
        insert into public.job_updates (tenant_id, work_order_id, author_id, type, body, visibility) values (t, v_wo, u_opv, 'issue', 'Waiting on replacement part from supplier - ordered.', 'client');
      end if;
    end if;

    -- quotations for planned work and the pre-works pipeline
    if v_status in ('awaiting_approval','approved','scheduled','in_progress','completed','invoiced','closed') and (v_pri = 'planned' or seed.r() < 0.25) then
      insert into public.quotations (tenant_id, organisation_id, contract_id, property_id, work_order_id, title, status, valid_until, sent_at, decided_at, decided_by_name, intro, created_by)
      values (t, v_org, v_con, v_prop, v_wo, 'Quotation: ' || v_title,
              case when v_status = 'awaiting_approval' then 'sent' else 'approved' end, (v_rep + interval '30 days')::date, v_rep + interval '2 days',
              case when v_status <> 'awaiting_approval' then v_rep + interval '4 days' end, case when v_status <> 'awaiting_approval' then 'Client asset manager (demo)' end,
              'Thank you for the opportunity to quote for the following works.', u_con)
      returning id into v_quo;
      insert into public.quotation_lines (tenant_id, quotation_id, line_type, description, quantity, unit, unit_price, sort_order) values
        (t, v_quo, 'labour', 'Labour - ' || replace(v_trade, '_', ' '), greatest(round(v_hours), 1), 'hour', 42, 1),
        (t, v_quo, 'material', 'Materials as specification', 1, 'item', round(seed.rnd(60, 900), 2), 2);
    end if;

    -- invoices for invoiced / closed work
    if v_status in ('invoiced','closed') then
      select completed_at into v_done from public.work_orders where id = v_wo;
      insert into public.invoices (tenant_id, organisation_id, contract_id, work_order_id, status, issue_date, due_date, purchase_order_ref, created_by)
      values (t, v_org, v_con, v_wo, 'issued', (v_done + interval '3 days')::date, (v_done + interval '33 days')::date, 'CPO-' || (70000 + floor(seed.r() * 9999)), u_fin)
      returning id into v_inv;
      v_amt := round(v_hours * 42 + case when v_pri = 'planned' then seed.rnd(1500, 7800) else seed.rnd(90, 420) end, 2);
      insert into public.invoice_lines (tenant_id, invoice_id, work_order_id, description, quantity, unit, unit_price, vat_rate)
      values (t, v_inv, v_wo, v_title || ' - labour and materials', 1, 'job', v_amt, case when v_org = orgs[5] then 20 else 20 end);
      if v_status = 'closed' and seed.r() < 0.85 then
        insert into public.payments (tenant_id, invoice_id, amount, paid_on, method, reference)
        select t, v_inv, total, least(due_date, current_date - 1), 'bacs', 'Remittance ' || (1000 + floor(seed.r() * 8999)) from public.invoices where id = v_inv;
      elsif (select due_date from public.invoices where id = v_inv) < current_date then
        update public.invoices set status = 'overdue' where id = v_inv;
      end if;
    end if;
  end loop;

  -- today's board: guarantee a realistic day for the operative demo user and the planner
  -- four visits today and two on the next working day, back to back with travel gaps
  for i in 0..5 loop
    select id into v_wo from public.work_orders where tenant_id = t and status = 'approved' and not exists (select 1 from public.job_assignments a where a.work_order_id = work_orders.id) order by reported_at limit 1;
    exit when v_wo is null;
    update public.work_orders set status = 'scheduled' where id = v_wo;
    d := case when i < 4 then seed.weekday(current_date) else seed.weekday(seed.weekday(current_date) + 1) end;
    insert into public.job_assignments (tenant_id, work_order_id, employee_id, scheduled_start, scheduled_end, status)
    values (t, v_wo, emps[1], seed.at_hour(d, 8 + (i % 4) * 2.25), seed.at_hour(d, 9.75 + (i % 4) * 2.25), 'scheduled');
  end loop;

  -- ---------------------------------------------------------------- purchasing
  for i in 1..24 loop
    select w.id, w.contract_id, w.property_id into v_wo, v_con, v_prop from public.work_orders w
      where w.tenant_id = t and w.status not in ('new','under_review','cancelled') order by seed.r() limit 1;
    v_sup := sups[1 + floor(seed.r() * 5)::int];
    v_status := seed.pick(array['draft','pending_approval','approved','sent','sent','received','received','received','invoiced']);
    insert into public.purchase_orders (tenant_id, supplier_id, work_order_id, contract_id, status, order_date, expected_date, delivery_property_id, delivery_notes, approved_by, approved_at, sent_at, created_by)
    values (t, v_sup, v_wo, v_con, v_status, current_date - floor(seed.r() * 60)::int, current_date + floor(seed.r() * 10)::int - 3, v_prop, 'Deliver to site, call operative on arrival',
            case when v_status not in ('draft','pending_approval') then u_fin end, case when v_status not in ('draft','pending_approval') then now() - interval '3 days' end,
            case when v_status in ('sent','received','invoiced') then now() - interval '2 days' end, u_off)
    returning id into v_po;
    for j in 1..(1 + floor(seed.r() * 3)::int) loop
      insert into public.purchase_order_lines (tenant_id, purchase_order_id, material_id, work_order_id, description, quantity, unit, unit_price, sort_order, quantity_received)
      select t, v_po, m.id, v_wo, m.name, m.qty, m.unit, m.unit_cost, j, case when v_status in ('received','invoiced') then m.qty else 0 end
      from (select *, (1 + floor(seed.r() * 10))::int as qty from public.materials where tenant_id = t and default_supplier_id = v_sup order by seed.r() limit 1) m;
    end loop;
    if v_status in ('received','invoiced') then
      insert into public.costs (tenant_id, work_order_id, category, description, amount, vat_amount, incurred_on, supplier_id, purchase_order_id, source)
      select t, v_wo, 'materials', 'PO ' || reference, subtotal, vat_total, order_date, supplier_id, id, 'purchase_order' from public.purchase_orders where id = v_po;
    end if;
  end loop;

  -- vehicle running costs & overheads (last 4 months, the span of the job history)
  for i in 0..3 loop
    d := (date_trunc('month', current_date) - make_interval(months => i))::date;
    insert into public.costs (tenant_id, category, description, amount, incurred_on, source) values
      (t, 'overhead', 'Office, yard and insurance overheads', 3900, d + 1, 'manual'),
      (t, 'vehicle', 'Fleet fuel cards', round(seed.rnd(700, 950), 2), d + 27, 'manual'),
      (t, 'vehicle', 'Fleet lease payments', 1240, d + 2, 'manual');
  end loop;

  -- ---------------------------------------------------------------- CRM pipeline & activities
  insert into public.crm_opportunities (tenant_id, organisation_id, title, stage, value, probability, expected_close_date, owner_id, source, created_by) values
    (t, orgs[7], 'Ochil Homes - responsive repairs tender', 'tender', 950000, 40, current_date + 45, u_dir, 'tender_portal', u_dir),
    (t, orgs[8], 'Meadowbank Care - estates maintenance', 'qualified', 260000, 30, current_date + 75, u_con, 'referral', u_con),
    (t, orgs[2], 'Lomond Vale - window replacement phase 3', 'proposal', 540000, 60, current_date + 21, u_con, 'repeat_client', u_con),
    (t, orgs[3], 'Carronvale - term maintenance re-tender', 'negotiation', 1750000, 70, current_date + 30, u_dir, 'framework', u_dir),
    (t, orgs[4], 'Strathcairn - communal decoration programme', 'lead', 85000, 15, current_date + 90, u_con, 'repeat_client', u_con),
    (t, orgs[5], 'Tayview - Summer Works 2027', 'qualified', 700000, 50, current_date + 120, u_dir, 'repeat_client', u_dir),
    (t, orgs[1], 'Kelvinbrae - damp & mould specialist team', 'won', 220000, 100, current_date - 30, u_dir, 'repeat_client', u_dir),
    (t, orgs[6], 'Clydegate - unit 14 fit-out', 'lost', 65000, 0, current_date - 12, u_con, 'website', u_con);
  update public.crm_opportunities set lost_reason = 'Lost on price - competitor 9% lower', closed_at = now() - interval '12 days' where stage = 'lost' and tenant_id = t;
  update public.crm_opportunities set closed_at = now() - interval '30 days', contract_id = contracts[1] where stage = 'won' and tenant_id = t;
  for i in 1..28 loop
    v_org := orgs[1 + floor(seed.r() * 8)::int];
    insert into public.crm_activities (tenant_id, organisation_id, contact_id, type, subject, body, due_at, completed_at, owner_id, created_at, created_by)
    values (t, v_org, (select id from public.contacts where organisation_id = v_org order by seed.r() limit 1),
            seed.pick(array['call','meeting','email','note','follow_up','follow_up']),
            seed.pick(array['Quarterly contract review','Discuss void turnaround times','Follow up on quotation','Introduce new contract manager','KPI performance review','Site walk-round','Renewal discussion','Invoice query']),
            'Notes recorded by the account team (demo).',
            case when i % 3 = 0 then now() + make_interval(days => floor(seed.r() * 14)::int - 3) end,
            case when i % 3 <> 0 then now() - make_interval(days => floor(seed.r() * 60)::int) end,
            seed.pick(array[u_dir::text, u_con::text])::uuid, now() - make_interval(days => floor(seed.r() * 70)::int), u_con);
  end loop;

  -- ---------------------------------------------------------------- certificates (compliance records)
  insert into public.certificates (tenant_id, type, property_id, issued_on, expires_on, issued_by, result)
  select t, seed.pick(array['gas_safety','eicr','fire_risk']), p.id, current_date - floor(seed.r() * 330)::int, current_date + floor(seed.r() * 120)::int - 10, 'PowerMac Joinery & Construction', 'satisfactory'
  from public.properties p where p.tenant_id = t and seed.r() < 0.45;

  -- ---------------------------------------------------------------- intake: authorised emails awaiting processing (AI email-to-job demo)
  insert into public.inbound_messages (tenant_id, channel, sender, subject, body, organisation_id, is_authorised, status, external_id) values
    (t, 'email', 'repairs.coordinator@kelvinbrae.test', 'Repair request - water coming through ceiling',
     'Hi team, tenant at 14 Rowan Drive, Glasgow G15 reports water coming through the kitchen ceiling from the flat above since this morning. Please attend urgently. Our ref KB-55120. Thanks, Douglas', orgs[1], true, 'new', 'demo-msg-1'),
    (t, 'email', 'asset.manager@lomondvale.test', 'Adaptation - level access shower',
     'Please quote for removal of bath and installation of level-access shower with grab rails at 7 Birch Grove, Dumbarton G82. OT referral attached. Not urgent - within the adaptations framework.', orgs[2], true, 'new', 'demo-msg-2'),
    (t, 'email', 'housing.repairs@carronvale.test', 'Void property ready for works',
     'Keys for 33 Thistle Street, Falkirk FK2 are available from the area office. Please carry out lettable standard works under the void programme. Target relet in 3 weeks.', orgs[3], true, 'new', 'demo-msg-3'),
    (t, 'email', 'someone@unknown-sender.test', 'Can you fix my roof?',
     'Hello, I saw your van. Can you give me a price for a new roof?', null, false, 'new', 'demo-msg-4');

  -- ---------------------------------------------------------------- notifications for management
  insert into public.notifications (tenant_id, user_id, type, severity, title, body, link) values
    (t, u_dir, 'contract.expiring', 'warning', 'Medical Adaptations Framework ends in 46 days', 'Renewal discussion not yet logged.', '/contracts'),
    (t, u_dir, 'intake.new', 'info', '3 authorised work requests waiting', 'Emails from Kelvinbrae, Lomond Vale and Carronvale are ready to turn into jobs.', '/jobs'),
    (t, u_ops, 'job.overdue', 'critical', 'Overdue jobs need attention', 'Some jobs have passed their target completion date.', '/jobs?view=list&filter=overdue');

  -- ---------------------------------------------------------------- second tenant (isolation)
  insert into public.organisations (tenant_id, name, category, status, town, postcode) values (t2, 'Northgate Lettings Portfolio', 'letting_agent', 'active', 'Aberdeen', 'AB10 1AA') returning id into v_org;
  for i in 1..5 loop
    insert into public.properties (tenant_id, organisation_id, address_line1, town, postcode, latitude, longitude, property_type, tenure)
    values (t2, v_org, (10 + i) || ' Granite Row', 'Aberdeen', 'AB1' || i || ' 2XY', 57.1497 + i * 0.004, -2.0943 - i * 0.004, 'flat', 'private_rent') returning id into v_prop;
    insert into public.work_orders (tenant_id, organisation_id, property_id, title, work_category, trade, priority, status)
    values (t2, v_org, v_prop, 'Northgate job ' || i || ' - should never be visible to PowerMac users', 'general_repairs', 'joiner', 'routine', 'new');
  end loop;

  -- seeded through the definer path above; the audit trail of seed inserts is not useful
  delete from public.audit_logs where tenant_id in (t, t2);
  insert into public.audit_logs (tenant_id, action, entity, summary) values (t, 'system', 'tenants', 'Demo environment created with sample data'), (t2, 'system', 'tenants', 'Demo environment created');
end $seed$;

drop schema seed cascade;
