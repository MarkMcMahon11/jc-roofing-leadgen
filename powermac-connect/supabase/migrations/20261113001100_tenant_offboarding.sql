-- =====================================================================================
-- POWERMAC CONNECT - 1100 Tenant offboarding
-- Deleting a company (end of contract / UK GDPR erasure) cascades to all of its records.
-- The row-level audit trigger must not try to log those cascaded deletions against a
-- tenant that no longer exists; the erasure itself is logged at platform level instead.
-- =====================================================================================

create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb; v_new jsonb; v_changes jsonb; v_row jsonb; v_tenant uuid;
  v_redact text[] := case when tg_nargs > 0 and tg_argv[0] <> '' then string_to_array(tg_argv[0], ',') else '{}'::text[] end;
  v_ignore text[] := array['updated_at','search_vector'];
begin
  v_row := to_jsonb(coalesce(new, old));
  v_tenant := nullif(v_row->>'tenant_id', '')::uuid;
  -- cascaded delete of a whole company: nothing to attach the entry to
  if tg_op = 'DELETE' and v_tenant is not null and not exists (select 1 from public.tenants where id = v_tenant) then
    return old;
  end if;

  if tg_op = 'INSERT' then
    select jsonb_object_agg(key, case when key = any(v_redact) and value <> 'null'::jsonb then '"[redacted]"'::jsonb else value end)
      into v_changes from jsonb_each(v_row) where not key = any(v_ignore);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    select jsonb_object_agg(key,
             case when key = any(v_redact) then jsonb_build_object('changed', true)
                  else jsonb_build_object('from', v_old->key, 'to', value) end)
      into v_changes
      from jsonb_each(v_new)
      where (v_old->key) is distinct from value and not key = any(v_ignore);
    if v_changes is null then return new; end if;
  else
    select jsonb_object_agg(key, case when key = any(v_redact) and value <> 'null'::jsonb then '"[redacted]"'::jsonb else value end)
      into v_changes from jsonb_each(v_row) where not key = any(v_ignore);
  end if;

  insert into public.audit_logs (tenant_id, actor_id, actor_email, action, entity, entity_id, summary, changes)
  values (
    v_tenant, auth.uid(), nullif(auth.jwt()->>'email', ''), lower(tg_op), tg_table_name,
    case when v_row ? 'id' then nullif(v_row->>'id', '')::uuid end,
    coalesce(v_row->>'reference', v_row->>'name', v_row->>'title', v_row->>'key'),
    v_changes
  );
  return coalesce(new, old);
end $$;

-- Platform-level erasure of a whole company, logged without the tenant link.
create or replace function public.platform_delete_tenant(p_tenant uuid, p_confirm_slug text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_slug text; v_name text;
begin
  if not app.is_platform_admin() then raise exception 'platform admins only' using errcode = '42501'; end if;
  select slug, name into v_slug, v_name from public.tenants where id = p_tenant;
  if v_slug is null then raise exception 'company not found' using errcode = 'P0002'; end if;
  if v_slug is distinct from p_confirm_slug then raise exception 'type the company short name to confirm' using errcode = '22023'; end if;
  delete from public.tenants where id = p_tenant;
  insert into public.audit_logs (tenant_id, actor_id, actor_email, action, entity, entity_id, summary)
  values (null, auth.uid(), auth.jwt()->>'email', 'delete', 'tenants', p_tenant, 'Company and all its data erased: ' || v_name);
end $$;
revoke execute on function public.platform_delete_tenant(uuid, text) from public, anon;
grant execute on function public.platform_delete_tenant(uuid, text) to authenticated;
