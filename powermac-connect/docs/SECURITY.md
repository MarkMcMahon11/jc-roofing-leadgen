# Security & UK GDPR controls

| Requirement | How PowerMac Connect meets it | Where |
|---|---|---|
| Tenant isolation | RLS on all 73 tables; composite tenant foreign keys; tested cross-tenant attacks | migrations 0100-0600, `supabase/tests/database/security.test.sql` |
| Role-based permissions | 53 permissions, per-tenant configurable roles, scoped external roles | `permissions`, `roles`, Settings -> Roles |
| Least privilege for external users | clients, operatives, subcontractors and occupants cannot read base tables; they use `portal_*` / `field_*` functions with explicit column lists and scope checks | 0900, `portal_field.test.sql` |
| Privilege-escalation prevention | no self role/status changes; cannot grant permissions you lack; cannot edit your own role; last user manager protected; platform-admin flag and subscription columns not writable by users | `app.check_membership`, `app.check_role_permission`, column grants |
| Approvals cannot be faked | approval stamps set by triggers from the signed-in user; approving requires the right permission | `app.guard_approvals`, workflow guard |
| Audit logs | append-only, written by triggers for every business table plus sign-in/out, invitations, approvals | `audit_logs`, Settings -> Audit log |
| Data minimisation | resident data in `occupants` (own permission); employee personal data and pay in `employee_private` (`workforce.pii`); audit log stores *that* personal fields changed, never their values | 0200, 0300, `app.audit_row` |
| Special-category data | vulnerability flags restricted to a fixed list needed for safe access | `occupants.vulnerability_flags` |
| Retention | configurable per company: former occupants anonymised after 24 months, AI logs 24, communications 72, audit 84 months... applied by `run_retention()` (service role, daily cron) and audited | Settings -> Data retention |
| Secure authentication | Supabase Auth, invitation-only (public sign-up disabled), 12+ character passwords, generic sign-in errors, rate limiting by Supabase Auth | `/login`, `/auth/*` |
| Session controls | HTTP-only cookies refreshed server-side; idle sign-out (`SESSION_IDLE_MINUTES`, default 8 h); sign-out clears company and activity cookies | `lib/supabase/proxy.ts` |
| Secure documents | private buckets; object paths start with the tenant id; storage RLS by permission; downloads only via short-lived signed URLs | 0600 storage policies |
| Encryption in transit | HTTPS only (HSTS header); Supabase encrypts at rest | `next.config.ts` |
| Secrets server-side | service-role, AI and integration keys never reach the browser (`server-only` modules); integrations page shows status, never values | `lib/supabase/admin.ts`, `lib/integrations.ts` |
| Security headers | CSP `frame-ancestors 'none'`, X-Frame-Options DENY, nosniff, referrer policy, permissions policy | `next.config.ts` |
| AI safeguards (Stage 6) | AI output stored as suggestions in `ai_activity`; sensitive actions need human approval; facts vs predictions labelled | `ai_activity` |

## Company offboarding (erasure)

`platform_delete_tenant(id, slug)` (platform admin, typed confirmation) deletes a company and, by cascade, every
record it owns; the erasure is logged at platform level. **Known gap:** files in the `documents` and `photos`
buckets under the company's `<tenant_id>/` folder must also be removed through the Storage API (not SQL); add
this to the platform console before the first real offboarding.

## Backup and recovery

- Supabase daily backups (Pro plan) with **Point-in-Time Recovery** enabled for production (RPO minutes).
- Schema is fully reproducible from `supabase/migrations`; `supabase db dump --data-only` nightly to a separate
  UK/EU storage account for an independent copy; quarterly restore test into a staging project.
- Storage buckets replicated by the nightly job (documents/photos) using the service role.
- Recovery runbook: restore PITR to a new project -> point `NEXT_PUBLIC_SUPABASE_URL`/keys at it -> redeploy.

## Before go-live checklist

- Host in a UK/EU region (Supabase London `eu-west-2`); sign a DPA with Supabase and the host.
- PowerMac (controller) approves the privacy notice (`/privacy`) and retention periods.
- Configure Supabase Auth: disable sign-ups, set site URL and redirect URLs, custom SMTP, MFA for directors/admins.
- Run `npm run test:db` against staging; run the role-based end-to-end checks.
- Set `CRON_SECRET` and schedule `run_retention()` daily.
