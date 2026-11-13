-- =====================================================================================
-- POWERMAC CONNECT - 0700 Invitations
-- Users are invited by someone with users.manage (membership status 'invited'). When the
-- invitee sets their password they accept: the ONLY change a user may make to their own
-- membership is invited -> active.
-- =====================================================================================

create or replace function app.check_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_scope text; v_missing text; v_self_accept boolean;
begin
  select scope_type into v_scope from public.roles where id = new.role_id and tenant_id = new.tenant_id;
  if v_scope is null then raise exception 'role does not belong to this tenant' using errcode = '23503'; end if;

  if (v_scope = 'internal'      and num_nonnulls(new.organisation_id, new.subcontractor_id, new.occupant_id) > 0)
  or (v_scope = 'client'        and (new.organisation_id is null  or num_nonnulls(new.employee_id, new.subcontractor_id, new.occupant_id) > 0))
  or (v_scope = 'operative'     and (new.employee_id is null      or num_nonnulls(new.organisation_id, new.subcontractor_id, new.occupant_id) > 0))
  or (v_scope = 'subcontractor' and (new.subcontractor_id is null or num_nonnulls(new.organisation_id, new.employee_id, new.occupant_id) > 0))
  or (v_scope = 'occupant'      and (new.occupant_id is null      or num_nonnulls(new.organisation_id, new.employee_id, new.subcontractor_id) > 0))
  then
    raise exception 'membership links do not match the % role scope', v_scope using errcode = '23514';
  end if;

  if auth.uid() is not null and not app.is_platform_admin() then
    v_self_accept := tg_op = 'UPDATE' and new.user_id = auth.uid() and old.status = 'invited' and new.status = 'active'
                     and new.role_id = old.role_id
                     and new.organisation_id is not distinct from old.organisation_id and new.employee_id is not distinct from old.employee_id
                     and new.subcontractor_id is not distinct from old.subcontractor_id and new.occupant_id is not distinct from old.occupant_id;
    if v_self_accept then return new; end if;

    if new.user_id = auth.uid() and (tg_op = 'INSERT' or new.role_id is distinct from old.role_id or new.status is distinct from old.status) then
      raise exception 'you cannot change your own role or status' using errcode = '42501';
    end if;
    select string_agg(rp.permission_key, ', ') into v_missing
    from public.role_permissions rp
    where rp.role_id = new.role_id and not app.has_perm(new.tenant_id, rp.permission_key);
    if v_missing is not null then
      raise exception 'you cannot assign a role with permissions you do not hold: %', v_missing using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Called after the invitee has set a password. Activates every pending invitation.
create or replace function public.accept_my_invitations() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  update public.memberships set status = 'active', accepted_at = now()
  where user_id = auth.uid() and status = 'invited';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.accept_my_invitations() from public, anon;
grant execute on function public.accept_my_invitations() to authenticated;
