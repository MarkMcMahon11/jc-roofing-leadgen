# Deploying PowerMac Connect

## 1. Supabase
1. Create a project in **London (eu-west-2)**. Note the URL, anon/publishable key and service-role key.
2. Install the Supabase CLI, then from `powermac-connect/`:
   ```bash
   supabase link --project-ref <ref>
   supabase db push            # applies supabase/migrations
   ```
   Do **not** run `seed.sql` on production; it creates a DEMO company with demo passwords.
   (For a sales/demo environment you may run it on a separate project.)
3. Auth settings: disable new user sign-ups; Site URL = your app URL; add `<app>/auth/callback` and
   `<app>/auth/confirm` to redirect URLs; configure custom SMTP; enable MFA.

## 2. App (Vercel or any Node 20+ host)
- Root directory: `powermac-connect`. Build `npm run build`, start `npm start`.
- Environment variables: see `docs/ARCHITECTURE.md` section 7 (`.env.example` lists them).

## 3. First company and administrator
1. Create your own user in Supabase Auth (invite), then in the SQL editor:
   ```sql
   update profiles set is_platform_admin = true where email = 'you@bpoai.ai';
   ```
2. Sign in, open **/platform**, create the company (this provisions roles, workflow, picklists, retention).
3. Give the company its first director (SQL editor, once):
   ```sql
   insert into memberships (tenant_id, user_id, role_id, status)
   select t.id, p.id, r.id, 'active' from tenants t, profiles p, roles r
   where t.slug = 'powermac' and p.email = 'director@powermac.co.uk' and r.tenant_id = t.id and r.key = 'director';
   ```
   From then on the director invites everyone else from **Settings -> Users**.

## Local development
```bash
cd powermac-connect
npm install
npm run stack:up        # Docker: Postgres, Auth, REST, Storage, mail catcher + demo data, writes .env.local
npm run dev -- -p 3100  # http://localhost:3100
npm run test:db         # database security tests
```
With the Supabase CLI instead: `supabase start && supabase db reset` (uses the same migrations and seed).
