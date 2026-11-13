-- =====================================================================================
-- POWERMAC CONNECT - 0400 Suppliers, materials & stock, purchasing, quotations, invoicing,
-- payments and the cost ledger. Every material purchase is traceable to job + contract.
-- Accounting packages (Xero/QuickBooks/Sage) stay the system of record for the ledger;
-- invoices/payments carry external ids for two-way sync (see integrations, 0500).
-- =====================================================================================

create table public.suppliers (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  reference          text not null,
  name               text not null check (length(btrim(name)) between 2 and 200),
  email              text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  orders_email       text check (orders_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone              text check (length(phone) <= 40),
  account_number     text check (length(account_number) <= 60),
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  address            text check (length(address) <= 500),
  postcode           text check (length(postcode) <= 10),
  categories         text[] not null default '{}',
  delivery_info      text check (length(delivery_info) <= 2000),
  status             text not null default 'active' check (status in ('active','on_hold','archived')),
  rating             numeric(2,1) check (rating between 0 and 5),
  notes              text check (length(notes) <= 5000),
  created_at         timestamptz not null default now(),
  created_by         uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference)
);

create table public.materials (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  sku                 text not null check (length(btrim(sku)) between 1 and 60),
  name                text not null check (length(btrim(name)) between 2 and 200),
  description         text check (length(description) <= 2000),
  category            text not null default 'general' check (length(category) <= 60),
  unit                text not null default 'each' check (unit in ('each','m','m2','m3','kg','tonne','litre','box','pack','pair','length','sheet','roll','bag','set')),
  default_supplier_id uuid,
  unit_cost           numeric(12,4) not null default 0 check (unit_cost >= 0),
  sell_price          numeric(12,4) check (sell_price >= 0),
  vat_rate            numeric(5,2) not null default 20 check (vat_rate between 0 and 100),
  is_stock_item       boolean not null default true,
  reorder_level       numeric(12,2) check (reorder_level >= 0),
  reorder_quantity    numeric(12,2) check (reorder_quantity > 0),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  created_by          uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, sku),
  foreign key (tenant_id, default_supplier_id) references public.suppliers(tenant_id, id) on delete set null (default_supplier_id)
);

create table public.supplier_prices (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  supplier_id    uuid not null,
  material_id    uuid not null,
  supplier_sku   text check (length(supplier_sku) <= 60),
  unit_price     numeric(12,4) not null check (unit_price >= 0),
  lead_time_days integer check (lead_time_days between 0 and 365),
  valid_from     date not null default current_date,
  valid_to       date,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, id),
  check (valid_to is null or valid_to >= valid_from),
  foreign key (tenant_id, supplier_id) references public.suppliers(tenant_id, id) on delete cascade,
  foreign key (tenant_id, material_id) references public.materials(tenant_id, id) on delete cascade
);
create index supplier_prices_material_idx on public.supplier_prices (tenant_id, material_id);

create table public.stock_locations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 2 and 120),
  type        text not null default 'warehouse' check (type in ('warehouse','van','site','supplier_held')),
  vehicle_id  uuid,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name),
  foreign key (tenant_id, vehicle_id) references public.vehicles(tenant_id, id) on delete set null (vehicle_id)
);

create table public.stock_levels (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  material_id uuid not null,
  location_id uuid not null,
  quantity    numeric(14,3) not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (material_id, location_id),
  foreign key (tenant_id, material_id) references public.materials(tenant_id, id) on delete cascade,
  foreign key (tenant_id, location_id) references public.stock_locations(tenant_id, id) on delete cascade
);
create index stock_levels_tenant_idx on public.stock_levels (tenant_id);

-- -------------------------------------------------------------------------------------
-- Purchasing: requisition -> supplier quotes (comparison) -> PO -> goods received
-- -------------------------------------------------------------------------------------
create table public.purchase_requisitions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  reference     text not null,
  work_order_id uuid,
  contract_id   uuid,
  requested_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  status        text not null default 'draft' check (status in ('draft','submitted','approved','rejected','ordered','cancelled')),
  needed_by     date,
  notes         text check (length(notes) <= 5000),
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete set null (work_order_id),
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete set null (contract_id)
);

create table public.purchase_requisition_lines (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  requisition_id      uuid not null,
  material_id         uuid,
  description         text not null check (length(btrim(description)) between 1 and 300),
  quantity            numeric(12,3) not null check (quantity > 0),
  unit                text not null default 'each',
  estimated_unit_cost numeric(12,4) check (estimated_unit_cost >= 0),
  created_at          timestamptz not null default now(),
  created_by          uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, requisition_id) references public.purchase_requisitions(tenant_id, id) on delete cascade,
  foreign key (tenant_id, material_id) references public.materials(tenant_id, id) on delete set null (material_id)
);

create table public.supplier_quotes (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  requisition_id uuid not null,
  supplier_id    uuid not null,
  total          numeric(14,2) not null check (total >= 0),
  lead_time_days integer check (lead_time_days between 0 and 365),
  valid_until    date,
  status         text not null default 'received' check (status in ('requested','received','accepted','declined')),
  notes          text check (length(notes) <= 2000),
  document_id    uuid,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, requisition_id) references public.purchase_requisitions(tenant_id, id) on delete cascade,
  foreign key (tenant_id, supplier_id) references public.suppliers(tenant_id, id) on delete cascade
);

create table public.purchase_orders (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  reference            text not null,
  supplier_id          uuid not null,
  requisition_id       uuid,
  work_order_id        uuid,
  contract_id          uuid,
  status               text not null default 'draft' check (status in ('draft','pending_approval','approved','sent','part_received','received','invoiced','cancelled')),
  order_date           date not null default current_date,
  expected_date        date,
  delivery_property_id uuid,
  delivery_location_id uuid,
  delivery_address     text check (length(delivery_address) <= 500),
  delivery_notes       text check (length(delivery_notes) <= 2000),
  subtotal             numeric(14,2) not null default 0,
  vat_total            numeric(14,2) not null default 0,
  total                numeric(14,2) not null default 0,
  supplier_invoice_ref text check (length(supplier_invoice_ref) <= 60),
  approved_by          uuid references public.profiles(id) on delete set null,
  approved_at          timestamptz,
  sent_at              timestamptz,
  notes                text check (length(notes) <= 5000),
  external_ref         text,
  created_at           timestamptz not null default now(),
  created_by           uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at           timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  foreign key (tenant_id, supplier_id) references public.suppliers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, requisition_id) references public.purchase_requisitions(tenant_id, id) on delete set null (requisition_id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete set null (work_order_id),
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete set null (contract_id),
  foreign key (tenant_id, delivery_property_id) references public.properties(tenant_id, id) on delete set null (delivery_property_id),
  foreign key (tenant_id, delivery_location_id) references public.stock_locations(tenant_id, id) on delete set null (delivery_location_id)
);
create index purchase_orders_wo_idx on public.purchase_orders (tenant_id, work_order_id);
create index purchase_orders_status_idx on public.purchase_orders (tenant_id, status);

create table public.purchase_order_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  purchase_order_id uuid not null,
  material_id       uuid,
  work_order_id     uuid,
  description       text not null check (length(btrim(description)) between 1 and 300),
  quantity          numeric(12,3) not null check (quantity > 0),
  unit              text not null default 'each',
  unit_price        numeric(12,4) not null check (unit_price >= 0),
  vat_rate          numeric(5,2) not null default 20 check (vat_rate between 0 and 100),
  line_total        numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  quantity_received numeric(12,3) not null default 0 check (quantity_received >= 0),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, purchase_order_id) references public.purchase_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, material_id) references public.materials(tenant_id, id) on delete set null (material_id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete set null (work_order_id)
);
create index purchase_order_lines_po_idx on public.purchase_order_lines (tenant_id, purchase_order_id);

create table public.goods_receipts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  purchase_order_id uuid not null,
  location_id       uuid,
  received_at       timestamptz not null default now(),
  received_by       uuid references public.profiles(id) on delete set null default auth.uid(),
  delivery_note_ref text check (length(delivery_note_ref) <= 60),
  notes             text check (length(notes) <= 2000),
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, purchase_order_id) references public.purchase_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, location_id) references public.stock_locations(tenant_id, id) on delete set null (location_id)
);

create table public.goods_receipt_lines (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  goods_receipt_id       uuid not null,
  purchase_order_line_id uuid not null,
  quantity               numeric(12,3) not null check (quantity > 0),
  created_at             timestamptz not null default now(),
  created_by             uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at             timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, goods_receipt_id) references public.goods_receipts(tenant_id, id) on delete cascade,
  foreign key (tenant_id, purchase_order_line_id) references public.purchase_order_lines(tenant_id, id) on delete cascade
);

-- Stock ledger. Every movement is traceable to a job / PO; stock_levels is maintained by trigger.
create table public.stock_movements (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  material_id       uuid not null,
  location_id       uuid not null,
  quantity          numeric(14,3) not null check (quantity <> 0),
  movement_type     text not null check (movement_type in ('receipt','issue','transfer_in','transfer_out','adjustment','return')),
  work_order_id     uuid,
  purchase_order_id uuid,
  unit_cost         numeric(12,4),
  notes             text check (length(notes) <= 1000),
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  check ((movement_type in ('receipt','transfer_in','return') and quantity > 0) or (movement_type in ('issue','transfer_out') and quantity < 0) or movement_type = 'adjustment'),
  foreign key (tenant_id, material_id) references public.materials(tenant_id, id) on delete restrict,
  foreign key (tenant_id, location_id) references public.stock_locations(tenant_id, id) on delete restrict,
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete set null (work_order_id),
  foreign key (tenant_id, purchase_order_id) references public.purchase_orders(tenant_id, id) on delete set null (purchase_order_id)
);
create index stock_movements_material_idx on public.stock_movements (tenant_id, material_id, created_at desc);

create or replace function app.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stock_levels as s (tenant_id, material_id, location_id, quantity)
  values (new.tenant_id, new.material_id, new.location_id, new.quantity)
  on conflict (material_id, location_id) do update set quantity = s.quantity + excluded.quantity, updated_at = now();
  return new;
end $$;
create trigger stock_movements_apply after insert on public.stock_movements
  for each row execute function app.apply_stock_movement();

-- Material used on a job (required / allocated / used)
create table public.job_materials (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  work_order_id          uuid not null,
  material_id            uuid,
  description            text not null check (length(btrim(description)) between 1 and 300),
  quantity               numeric(12,3) not null check (quantity > 0),
  unit                   text not null default 'each',
  unit_cost              numeric(12,4) check (unit_cost >= 0),
  status                 text not null default 'required' check (status in ('required','ordered','allocated','used','returned')),
  purchase_order_line_id uuid,
  stock_movement_id      uuid,
  created_at             timestamptz not null default now(),
  created_by             uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at             timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, material_id) references public.materials(tenant_id, id) on delete set null (material_id),
  foreign key (tenant_id, purchase_order_line_id) references public.purchase_order_lines(tenant_id, id) on delete set null (purchase_order_line_id),
  foreign key (tenant_id, stock_movement_id) references public.stock_movements(tenant_id, id) on delete set null (stock_movement_id)
);
create index job_materials_wo_idx on public.job_materials (tenant_id, work_order_id);

-- -------------------------------------------------------------------------------------
-- Rates (used by estimating and the AI draft-quote feature)
-- -------------------------------------------------------------------------------------
create table public.rate_cards (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid,
  name        text not null check (length(btrim(name)) between 2 and 160),
  is_default  boolean not null default false,
  valid_from  date,
  valid_to    date,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete cascade
);
create unique index rate_cards_one_default on public.rate_cards (tenant_id) where is_default;

create table public.rate_card_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  rate_card_id  uuid not null,
  code          text not null check (length(btrim(code)) between 1 and 30),
  description   text not null check (length(btrim(description)) between 2 and 500),
  trade         text,
  unit          text not null default 'each',
  rate          numeric(12,2) not null check (rate >= 0),
  labour_hours  numeric(7,2) check (labour_hours >= 0),
  material_cost numeric(12,2) check (material_cost >= 0),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  unique (rate_card_id, code),
  foreign key (tenant_id, rate_card_id) references public.rate_cards(tenant_id, id) on delete cascade
);

-- -------------------------------------------------------------------------------------
-- Quotations
-- -------------------------------------------------------------------------------------
create table public.quotations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  reference         text not null,
  organisation_id   uuid not null,
  contract_id       uuid,
  property_id       uuid,
  work_order_id     uuid,
  title             text not null check (length(btrim(title)) between 2 and 200),
  status            text not null default 'draft' check (status in ('draft','internal_review','sent','approved','rejected','expired','superseded')),
  version           integer not null default 1 check (version > 0),
  valid_until       date,
  labour_total      numeric(14,2) not null default 0,
  materials_total   numeric(14,2) not null default 0,
  subtotal          numeric(14,2) not null default 0,
  vat_total         numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  intro             text check (length(intro) <= 5000),
  terms             text check (length(terms) <= 10000),
  sent_at           timestamptz,
  decided_at        timestamptz,
  decided_by_name   text check (length(decided_by_name) <= 160),
  decided_by_user   uuid references public.profiles(id) on delete set null,
  rejection_reason  text check (length(rejection_reason) <= 2000),
  ai_generated      boolean not null default false,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete restrict,
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete set null (contract_id),
  foreign key (tenant_id, property_id) references public.properties(tenant_id, id) on delete set null (property_id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete set null (work_order_id)
);
create index quotations_wo_idx on public.quotations (tenant_id, work_order_id);
create index quotations_status_idx on public.quotations (tenant_id, status);

create table public.quotation_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  quotation_id      uuid not null,
  line_type         text not null default 'labour' check (line_type in ('labour','material','subcontract','plant','prelims','other')),
  description       text not null check (length(btrim(description)) between 1 and 500),
  quantity          numeric(12,3) not null default 1 check (quantity > 0),
  unit              text not null default 'each',
  unit_price        numeric(12,2) not null check (unit_price >= 0),
  vat_rate          numeric(5,2) not null default 20 check (vat_rate between 0 and 100),
  line_total        numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  rate_card_item_id uuid,
  material_id       uuid,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, quotation_id) references public.quotations(tenant_id, id) on delete cascade,
  foreign key (tenant_id, rate_card_item_id) references public.rate_card_items(tenant_id, id) on delete set null (rate_card_item_id),
  foreign key (tenant_id, material_id) references public.materials(tenant_id, id) on delete set null (material_id)
);

-- -------------------------------------------------------------------------------------
-- Invoices, payments, costs
-- -------------------------------------------------------------------------------------
create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  reference        text not null,
  organisation_id  uuid not null,
  contract_id      uuid,
  work_order_id    uuid,
  quotation_id     uuid,
  status           text not null default 'draft' check (status in ('draft','issued','part_paid','paid','overdue','void','credited')),
  issue_date       date,
  due_date         date,
  subtotal         numeric(14,2) not null default 0,
  vat_total        numeric(14,2) not null default 0,
  total            numeric(14,2) not null default 0,
  amount_paid      numeric(14,2) not null default 0 check (amount_paid >= 0),
  retention_amount numeric(14,2) not null default 0 check (retention_amount >= 0),
  purchase_order_ref text check (length(purchase_order_ref) <= 60),
  notes            text check (length(notes) <= 5000),
  external_system  text check (external_system in ('xero','quickbooks','sage','other')),
  external_ref     text check (length(external_ref) <= 120),
  synced_at        timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  check (due_date is null or issue_date is null or due_date >= issue_date),
  foreign key (tenant_id, organisation_id) references public.organisations(tenant_id, id) on delete restrict,
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete set null (contract_id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete set null (work_order_id),
  foreign key (tenant_id, quotation_id) references public.quotations(tenant_id, id) on delete set null (quotation_id)
);
create index invoices_status_due_idx on public.invoices (tenant_id, status, due_date);
create index invoices_org_idx on public.invoices (tenant_id, organisation_id);

create table public.invoice_lines (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  invoice_id    uuid not null,
  work_order_id uuid,
  description   text not null check (length(btrim(description)) between 1 and 500),
  quantity      numeric(12,3) not null default 1 check (quantity > 0),
  unit          text not null default 'each',
  unit_price    numeric(12,2) not null,
  vat_rate      numeric(5,2) not null default 20 check (vat_rate between 0 and 100),
  line_total    numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, invoice_id) references public.invoices(tenant_id, id) on delete cascade,
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete set null (work_order_id)
);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  invoice_id   uuid not null,
  amount       numeric(14,2) not null check (amount > 0),
  paid_on      date not null,
  method       text not null default 'bacs' check (method in ('bacs','card','cheque','cash','direct_debit','other')),
  reference    text check (length(reference) <= 120),
  external_ref text check (length(external_ref) <= 120),
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, invoice_id) references public.invoices(tenant_id, id) on delete restrict
);

-- Totals are derived, never typed: lines -> header, payments -> amount_paid/status.
create or replace function app.recalc_document_totals() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_sub numeric; v_vat numeric; v_lab numeric; v_mat numeric;
begin
  if tg_table_name = 'quotation_lines' then
    v_id := coalesce(new.quotation_id, old.quotation_id);
    select coalesce(sum(line_total),0), coalesce(sum(round(line_total * vat_rate / 100, 2)),0),
           coalesce(sum(line_total) filter (where line_type in ('labour','prelims')),0),
           coalesce(sum(line_total) filter (where line_type = 'material'),0)
      into v_sub, v_vat, v_lab, v_mat from public.quotation_lines where quotation_id = v_id;
    update public.quotations set subtotal = v_sub, vat_total = v_vat, total = v_sub + v_vat, labour_total = v_lab, materials_total = v_mat where id = v_id;
  elsif tg_table_name = 'invoice_lines' then
    v_id := coalesce(new.invoice_id, old.invoice_id);
    select coalesce(sum(line_total),0), coalesce(sum(round(line_total * vat_rate / 100, 2)),0)
      into v_sub, v_vat from public.invoice_lines where invoice_id = v_id;
    update public.invoices set subtotal = v_sub, vat_total = v_vat, total = v_sub + v_vat where id = v_id;
  elsif tg_table_name = 'purchase_order_lines' then
    v_id := coalesce(new.purchase_order_id, old.purchase_order_id);
    select coalesce(sum(line_total),0), coalesce(sum(round(line_total * vat_rate / 100, 2)),0)
      into v_sub, v_vat from public.purchase_order_lines where purchase_order_id = v_id;
    update public.purchase_orders set subtotal = v_sub, vat_total = v_vat, total = v_sub + v_vat where id = v_id;
  end if;
  return null;
end $$;
create trigger quotation_lines_totals after insert or update or delete on public.quotation_lines for each row execute function app.recalc_document_totals();
create trigger invoice_lines_totals after insert or update or delete on public.invoice_lines for each row execute function app.recalc_document_totals();
create trigger purchase_order_lines_totals after insert or update or delete on public.purchase_order_lines for each row execute function app.recalc_document_totals();

create or replace function app.apply_payments() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce(new.invoice_id, old.invoice_id); v_paid numeric;
begin
  select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id = v_id;
  update public.invoices i set amount_paid = v_paid,
    status = case when i.status in ('void','credited','draft') then i.status
                  when v_paid >= i.total - i.retention_amount and i.total > 0 then 'paid'
                  when v_paid > 0 then 'part_paid'
                  when i.due_date < current_date then 'overdue'
                  else 'issued' end
  where i.id = v_id;
  return null;
end $$;
create trigger payments_apply after insert or update or delete on public.payments for each row execute function app.apply_payments();

-- Cost ledger: the single source for job/contract profitability.
create table public.costs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  work_order_id     uuid,
  contract_id       uuid,
  project_id        uuid,
  category          text not null check (category in ('labour','materials','subcontractor','vehicle','plant','overhead','other')),
  description       text not null check (length(btrim(description)) between 1 and 300),
  amount            numeric(14,2) not null,
  vat_amount        numeric(14,2) not null default 0,
  incurred_on       date not null default current_date,
  supplier_id       uuid,
  subcontractor_id  uuid,
  employee_id       uuid,
  vehicle_id        uuid,
  purchase_order_id uuid,
  timesheet_id      uuid unique,
  source            text not null default 'manual' check (source in ('manual','timesheet','purchase_order','stock_issue','import','accounting_sync')),
  external_ref      text,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete set null (work_order_id),
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id) on delete set null (contract_id),
  foreign key (tenant_id, project_id) references public.projects(tenant_id, id) on delete set null (project_id),
  foreign key (tenant_id, supplier_id) references public.suppliers(tenant_id, id) on delete set null (supplier_id),
  foreign key (tenant_id, subcontractor_id) references public.subcontractors(tenant_id, id) on delete set null (subcontractor_id),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete set null (employee_id),
  foreign key (tenant_id, vehicle_id) references public.vehicles(tenant_id, id) on delete set null (vehicle_id),
  foreign key (tenant_id, purchase_order_id) references public.purchase_orders(tenant_id, id) on delete set null (purchase_order_id),
  foreign key (tenant_id, timesheet_id) references public.timesheets(tenant_id, id) on delete cascade
);
create index costs_wo_idx on public.costs (tenant_id, work_order_id);
create index costs_contract_date_idx on public.costs (tenant_id, contract_id, incurred_on);
create index costs_date_idx on public.costs (tenant_id, incurred_on);

-- Contract inherited from the job when not given, so contract reporting is complete.
create or replace function app.costs_fill_contract() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.contract_id is null and new.work_order_id is not null then
    select contract_id, project_id into new.contract_id, new.project_id from public.work_orders where id = new.work_order_id;
  end if;
  return new;
end $$;
create trigger costs_fill_contract before insert or update of work_order_id on public.costs for each row execute function app.costs_fill_contract();

-- Approved timesheets post labour cost to the ledger (and stay in step if changed).
create or replace function app.post_timesheet_cost() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and new.cost_amount is not null then
    insert into public.costs (tenant_id, work_order_id, category, description, amount, incurred_on, employee_id, timesheet_id, source, created_by)
    values (new.tenant_id, new.work_order_id, 'labour', 'Labour ' || new.hours || 'h (' || new.entry_type || ')', new.cost_amount, new.work_date, new.employee_id, new.id, 'timesheet', new.approved_by)
    on conflict (timesheet_id) do update set amount = excluded.amount, work_order_id = excluded.work_order_id, incurred_on = excluded.incurred_on, description = excluded.description;
  else
    delete from public.costs where timesheet_id = new.id;
  end if;
  return null;
end $$;
create trigger timesheets_post_cost after insert or update of status, hours, cost_amount, work_order_id on public.timesheets
  for each row execute function app.post_timesheet_cost();
