# Building a module in PowerMac Connect

Every module follows the same shape. Read this before adding a screen.

## Where things go

```
app/(app)/<module>/
  page.tsx            list (server component): filters in the URL, paginated query
  new/page.tsx        create form page (or a modal on the list)
  [id]/page.tsx       record detail (server component)
  [id]/edit/page.tsx  edit form (optional; inline editing is fine)
  actions.ts          "use server" mutations for the module
  *-form.tsx          "use client" forms using components/ui/form
```
Internal staff pages live under `app/(app)` and get the shell automatically.

## Rules

1. **Guard every page and action.** First line: `const ctx = await requireInternal("<perm>.read")` in pages,
   `requireInternal("<perm>.write")` in actions (`lib/auth/context.ts`). Hide buttons the user cannot use with
   `ctx.can("<perm>")` - the database enforces it anyway (RLS), the UI should not offer it.
2. **Query as the user.** `const supabase = await createClient()` (`lib/supabase/server.ts`). Never use the admin
   client for business data. Always filter `.eq("tenant_id", ctx.tenantId)` (RLS also isolates tenants; the
   filter keeps queries index-friendly when a user belongs to several companies).
3. **Writes go through Server Actions** that: guard -> validate with zod -> write with `tenant_id: ctx.tenantId`
   -> `revalidatePath(...)` -> return `ActionResult` (or `redirect()` after a create). Map DB errors with
   `fromDb(error)` from `lib/actions.ts` - never show raw SQL errors.
4. **Forms** use `ActionForm`, `TextField`, `SelectField`, `TextAreaField`, `CheckboxField`, `SubmitButton` from
   `components/ui/form.tsx`. Field `name` must match the zod key so errors land on the field.
5. **Lists**: `SearchBox`, `FilterSelect`, `Pagination`, `LinkTabs` (`components/ui/url-controls.tsx`) keep state
   in the URL. Use `{ count: "exact" }` + `.range()` for paging (25-50 rows per page).
6. **UI kit** (`components/ui/primitives.tsx`): `PageHeader`, `Card`/`CardHeader`/`CardBody`, `Table`/`THead`/
   `TH`/`TR`/`TD`, `Badge`, `ColourBadge` (job status colours), `Stat` (KPI tile that links to records),
   `EmptyState`, `DefinitionList`, `Notice`, `Mono` (references), `ButtonLink`, `buttonClass`.
   Charts: `components/ui/charts.tsx`. Maps: `components/ui/map.tsx` (import it in a client component).
   Icons: `lucide-react`.
7. **Formatting**: `lib/format.ts` (`money`, `date`, `dateTime`, `relative`, `daysUntil`, `label`). UK English,
   GBP, Europe/London.
8. **Picklists & statuses** come from the database: `getLookups(tenantId)` and `getStatuses(tenantId)`
   (`lib/data/lookups.ts`). Never hardcode trades, categories or job statuses in the UI.
9. **Job status changes** must go through the configured workflow: offer only transitions in
   `job_status_transitions` (from the current status), the database rejects anything else.
10. **Personal data**: occupants (`occupants.read`), employee private data (`workforce.pii`) are separate tables
    with their own permissions - show them only when `ctx.can(...)` and never copy them into other tables.
11. **No placeholders.** Every button does something real. If an integration is not configured, say so and offer
    the honest fallback (see `lib/email.ts`).
12. **Types**: `lib/database.types.ts` is generated (`node scripts/gen-types.mjs`). Embedded selects with more than
    one foreign key to the same table need a hint, e.g. `profiles!work_orders_manager_id_fkey(full_name)`.

## Verifying

```
npm run stack:up        # local Supabase (Docker) with the demo data
npm run dev -- -p 3100  # app
npx tsc --noEmit && npx eslint .
npm run test:db         # pgTAP security suite
```
Demo sign-ins are listed at the top of `supabase/seed.sql`.
