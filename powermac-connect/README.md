# POWERMAC CONNECT

**One Connected Operation. Complete Business Intelligence.**
The operating system for construction and property-maintenance contractors - built by BPOAI.AI for
PowerMac Joinery & Construction (Scotland), and designed to be licensed to other contractors as SaaS.

- Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4
- Supabase: PostgreSQL 17 with Row Level Security, Auth, Storage
- No unnecessary dependencies: charts, drag-and-drop, maps (Leaflet + OpenStreetMap) and forms are built in
- PowerMac brand theme (black, PMJ lime green, brushed silver): glass panels, pointer-lit cards with 3D tilt,
  and an animated three.js construction scene behind the app (`components/three/brand-scene.tsx`). It is
  skipped on phones and frozen to one still frame when the device asks for reduced motion

## What is in the box

| Area | What works today |
|---|---|
| Platform | Multi-tenant SaaS: companies, plans, subscriptions, seats, demo flag; BPOAI.AI console at `/platform` |
| Security | RLS on every table, composite tenant keys, 53 permissions, configurable roles, escalation guards, audit log with personal-data redaction, retention rules, idle sign-out |
| Command centre | Live KPIs (each links to its records), job map, alerts (renewals, certifications, approvals, budgets, KPI performance, stock, invoices), status & throughput charts, finance charts, contract performance, workforce today, live activity |
| CRM | Client accounts, contacts, activity history, follow-ups, opportunity pipeline |
| Contracts | Contracts with SLAs, KPIs (target vs actual), variations with approval, linked properties, documents, alerts |
| Properties | Searchable database with map view, occupants (protected personal data), inspections, certificates, documents |
| Jobs | Board / list / calendar / map, configurable 13-stage workflow enforced by the database, assignment with recommendations and clash checks, timeline, materials, checklists, photos, bulk creation, email/API intake queue |
| Scheduling | Drag-and-drop planner (week/day), conflict detection, explainable operative recommendations |
| Workforce | Employees, skills & certifications with expiry, absences, vehicles, subcontractors with insurance/CIS compliance |
| Field app `/field` | Mobile, one-handed: today's jobs, navigate, arrive/start/pause/finish, checklist, photos, materials, issues & approval requests, timesheets, customer sign-off with signature - works offline and syncs when signal returns |
| Client portal `/portal` | Corporate clients see only their own data: jobs and progress, photos, repair requests, quotation approval, invoices, contract performance, messages |
| Brand & motion | PMJ logo and colours throughout, Exo 2 display type, glass navigation, 3D tilt on KPI tiles, staggered page entrances, colour-blind-checked chart palette |

Later stages (schema already in place): procurement & stock screens, quotation/invoice builders and finance
module (Stage 5), PowerMac AI and the automation engine (Stage 6), accounting/WhatsApp integrations and
production hardening (Stage 7). See `docs/ARCHITECTURE.md`.

## Run it locally (Docker)

```bash
cd powermac-connect
npm install
npm run stack:up          # local Supabase (Postgres, Auth, REST, Storage, mail) + DEMO data; writes .env.local
npm run dev -- -p 3100    # open http://localhost:3100
```

Demo sign-ins (password `Demo-PowerMac-2026!`, local/demo only):

| Email | Sees |
|---|---|
| `director@powermac.test` | everything (Company Director) |
| `ops@powermac.test` | operations, scheduling, workforce |
| `contracts@powermac.test` | clients, contracts, approvals |
| `office@powermac.test` | admin: jobs, CRM, properties (no finance) |
| `finance@powermac.test` | finance, purchasing, employee pay data |
| `operative@powermac.test` | the field app (`/field`) |
| `subcontractor@powermac.test` | the field app for a subcontractor |
| `client@kelvinbrae.test` | the client portal (`/portal`) for one housing association |
| `admin@bpoai.test` | BPOAI.AI platform console |
| `director@northgate.test` | a second, separate company (isolation) |

Mail sent by Supabase Auth (password resets) appears at http://127.0.0.1:54324.

## Checks

```bash
npx tsc --noEmit && npx eslint .
npm run test:db          # 68 pgTAP tests: tenant isolation, roles, escalation, workflow, audit, erasure, portal & field scope
npm run test:e2e         # 36 role-based browser checks against a running app (BASE_URL, default http://localhost:3100)
npm run build
```

## Documentation

- `docs/ARCHITECTURE.md` - architecture, multi-tenancy, roles, database relationship model, screens, env vars, integrations, stages
- `docs/SECURITY.md` - UK GDPR controls, backup and recovery, go-live checklist
- `docs/DEPLOYMENT.md` - Supabase + Vercel deployment and first company setup
- `docs/MODULE_PATTERN.md` - how every module is built (for developers)
