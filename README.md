# JC Roofing – Instant Quote & Inspection Booking

Mobile-first web app: address → roof details → instant price range → start window → booked inspection.
Full requirements: [docs/PRD.md](docs/PRD.md).

## Run the preview (costs nothing, no keys needed)
```bash
npm install
cp .env.example .env.local      # then edit ADMIN_PASSWORD
npm run dev                      # http://localhost:3000
```
- Customer flow: `/`
- Owner dashboard: `/admin` (sign in at `/admin/login` with the business email and the `ADMIN_PASSWORD`; locked if the password is not set)
- Clickable design mock: `/preview.html`
- Privacy notice draft: `/privacy`

In preview:
- Address search uses OpenStreetMap + Postcodes.io (free).
- Texts and emails are not sent; they appear under **Messages (preview)** on the owner page.
- Inspection booking uses the built-in picker.
- Data is stored in `data/*.json` (git-ignored except settings).

## Switching on paid tools at deployment
Set these in the host's environment (see `.env.example`). No code changes:

| Capability | Variable(s) |
|---|---|
| Google address search + roof measurement | `GOOGLE_MAPS_API_KEY` |
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| Email | `RESEND_API_KEY`, `RESEND_FROM` |
| Scheduler embed | `NEXT_PUBLIC_CALENDLY_URL` (leave blank to use the built-in booking picker). The webhook `/api/calendly` needs a paid Calendly plan and `CALENDLY_WEBHOOK_SIGNING_KEY`; it is switched off and rejects all requests until that key is set |
| Let Google index the live site | `ALLOW_INDEXING=1` (previews are hidden from search engines by default) |
| Test/other storage folder | `DATA_DIR` |

Before going live also: replace JSON storage with a managed database, use a commercial-allowed host,
and have JC Roofing approve the privacy notice and trust claims.

## Permanent storage (Supabase, free plan is enough to start)
1. Create a free project at supabase.com. Choose a region close to the UK (London or Ireland).
2. In the project open **SQL Editor**, paste the contents of `docs/supabase.sql`, and **Run**.
3. In **Project Settings -> API** copy the **Project URL** and the **secret / service_role key**.
4. On the host (e.g. Vercel -> Settings -> Environment Variables) add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy.
5. Open `/admin`: it shows "Database connected". Without these two variables the owner page warns that storage is temporary.

Keep the secret key private: it only goes in server environment variables, never in the browser or in git.
Note: Supabase free projects pause after about a week without use; upgrade or keep the site active for live use.

## Customer photos + AI read (optional)
On the result screen, a customer can add up to 4 photos (roof, the problem area, a chimney) at full quality - no
compression, so a large phone photo still works. They upload **directly to Supabase Storage** from the browser
(never through this app's own server), because Vercel and similar hosts cap a serverless function's request body at
about 4.5MB, well under a real phone photo. The bucket is private; the owner page shows photos via short-lived
signed links.

If `ANTHROPIC_API_KEY` is set, each photo also gets an instant AI read via the Claude API (model `claude-sonnet-5`):
a material guess, a plain-English description of what's visible, and roughly how much of the roof looks affected -
shown to the customer immediately and to the owner on `/admin`. This is a rough visual impression, not a survey: it
is always shown next to the existing price range (never in place of it) and labelled "confirmed at your free
inspection", the same as every other estimate in this app. With no key set, photo uploads still work; there is just
no AI read.

Cost: this calls the Anthropic API, which bills per photo analysed (a small amount per call at Claude Sonnet 5's
rate of $2 per million input tokens / $10 per million output tokens - larger, higher-resolution photos cost more
since they use more tokens; check the Anthropic Console for exact per-request cost once switched on). Leave the key
unset to keep this free, or set a spending limit in the Anthropic Console before enabling it for real customers.

## Jobs the quote form handles
New roofs (slate/tile, measured or estimated roof size), repairs, flat roofs (GRP), gutters and fascias, chimney removal,
solar panels, and "something else" (no price, the owner calls). Every price except new roofs is editable on `/admin`
under "Other jobs"; new-roof prices are per material. All shipped numbers are placeholders until the owner confirms them.

## Owner dashboard (operations)
`/admin` is a business-operations dashboard in JC Roofing's own theme, structured like a fleet-management system:
Dashboard, Leads and quotes, Jobs and schedule (with a van planner), Project map (customer projects coloured by stage,
plus the vans), Vans, Team, Servicing, Fines and notices, Documents and deadlines, Costs, Reports (printable),
Messages, Quote prices and an Activity log.

- Sign in with an email + the `ADMIN_PASSWORD` (a signed 7-day cookie; 10 wrong tries lock that connection out for 10 minutes).
  Allowed emails: `OWNER_EMAIL` (comma separated), the owner email saved under Quote prices, and the business email.
- Vans, team, jobs, servicing, notices and costs are one JSON document ("fleet") in the same store as leads (Supabase
  `kv` table, or `data/fleet.json` locally). A new site starts with SAMPLE data (made-up vans/crew/jobs/costs); use
  "Clear sample data" on the dashboard, then enter the real ones. Enquiries and prices are always real.
- The project map uses OpenStreetMap tiles (free). Customer pins come from each enquiry's address (or postcode) and
  from jobs added with a postcode. Van positions are SAMPLES until a tracker/telematics feed is connected.
- Set `SESSION_SECRET` (32+ random characters) on the live site; otherwise the cookie key is derived from the password.

## WhatsApp assistant (`/admin/assistant`)
One WhatsApp Business number that customers, suppliers, the team and Jamie all message. Who is talking is decided only by the
sender's verified number (Meta signs every webhook call; unsigned calls are refused).

- **Customers and suppliers**: the assistant is a front desk. It sees only a public facts sheet (no leads, prices, staff or costs), never
  agrees a price or date, collects name / address / postcode / job / when suits, and turns it into a task for Jamie (urgent ones ping him at once).
  Replies are filtered (no foreign links, no money amounts). STOP opts the person out.
- **Team**: a recognised employee (their number is in Team) can ask for their own schedule, job details, van and deadlines, say a job has
  started / finished or give a van's mileage (these update the system straight away; switch off under Set up to route them via Jamie),
  and raise issues (van fault, safety, materials, late/sick, time off, expense). Nothing is approved by raising it.
  Daily WhatsApp reminders go only to people with "WhatsApp reminders" ticked on their Team record.
- **Jamie** (number from `OWNER_WHATSAPP`, else "Your mobile" under Quote prices): asks anything ("what's on tomorrow", "who's free Friday",
  "new leads?") and gives instructions in plain English ("book an inspection for Mrs Smith Thursday 10am with Callum and the Transit and tell her",
  "remind the lads about the toolbox talk", "log £62 diesel on the Transit"). Every change is shown back as a numbered list and only happens
  when he replies YES; NO cancels; a pending list expires after 2 hours. Without an AI key he gets simple commands (today, tomorrow, week, leads, tasks, alerts, vans, costs, "done 2").
- The dashboard page shows what needs doing, every conversation (take over / hand back / stop / delete), a "Try it" simulator that sends nothing
  to any phone, and a setup checklist. A morning cron (`vercel.json`, 06:00 UTC) sends Jamie a briefing and each opted-in team member their day.
- Everything goes through the same validated write path as the dashboard, so a bad message can't write bad data.
- Conversations and finished tasks are deleted after 90 days.

Environment: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (any long random string you also paste into Meta),
`OWNER_WHATSAPP`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, optional `WHATSAPP_TEMPLATE_NAME` / `WHATSAPP_TEMPLATE_LANG` (an approved utility template
with ONE variable, used for reminders to people who haven't messaged in 24 h), `ASSISTANT_MODEL` (default `claude-sonnet-5-5`),
`ASSISTANT_DAILY_AI_CAP` (default 300 AI-answered messages a day), `SITE_URL`. In Meta's WhatsApp settings set the webhook Callback URL to
`https://<your-site>/api/whatsapp/webhook` and subscribe to **messages**. Free-form WhatsApp replies only work within 24 h of the person's last
message; anything else needs an approved template. With none of this set the assistant runs in demo mode (dashboard only).

## Testing
`scripts/agent-server.sh <port>` starts an isolated production server (own data folder, fake address data,
admin password `testpw`). Run `npm run build` first. Stop it with `kill $(lsof -tiTCP:<port> -sTCP:LISTEN)`.

## Security and privacy behaviour (preview)
- Input from the public form is validated strictly (types, lengths, UK phone/email/postcode) and only known fields are stored.
- Rate limits: per connection and per phone/email on enquiries, bookings and address search; failed owner logins lock out after 10 tries.
- Old enquiries are deleted automatically (6 months if never booked, 24 months otherwise), together with their stored messages.
- Consent time and wording version are stored with every enquiry. The owner page can export or delete a customer's data.
- Limits are held in memory per server, so on a serverless host add the host's firewall/rate limiting too.
