-- =====================================================================================
-- POWERMAC CONNECT - 1200 Internal staff directory (for "manager" / "owner" pickers)
-- Memberships are readable only with users.manage. Pickers need just the names of active
-- internal colleagues - nothing else - so they get this minimal function.
-- =====================================================================================
create or replace function public.internal_staff(p_tenant uuid)
returns table (user_id uuid, full_name text, role_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (p_tenant in (select m.tenant_id from public.memberships m join public.roles r on r.id = m.role_id
                       where m.user_id = auth.uid() and m.status = 'active' and r.scope_type = 'internal')) then
    raise exception 'not available for your account' using errcode = '42501';
  end if;
  return query
  select p.id, coalesce(nullif(p.full_name, ''), p.email), r.name
  from public.memberships m
  join public.roles r on r.id = m.role_id and r.scope_type = 'internal'
  join public.profiles p on p.id = m.user_id
  where m.tenant_id = p_tenant and m.status = 'active'
  order by 2;
end $$;
revoke execute on function public.internal_staff(uuid) from public, anon;
grant execute on function public.internal_staff(uuid) to authenticated;
