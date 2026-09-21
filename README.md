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
- Owner page: `/admin` (password from `ADMIN_PASSWORD`; `/admin` is locked if it is not set)
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
add real authentication to `/admin`, and have JC Roofing approve the privacy notice and trust claims.

## Permanent storage (Supabase, free plan is enough to start)
1. Create a free project at supabase.com. Choose a region close to the UK (London or Ireland).
2. In the project open **SQL Editor**, paste the contents of `docs/supabase.sql`, and **Run**.
3. In **Project Settings -> API** copy the **Project URL** and the **secret / service_role key**.
4. On the host (e.g. Vercel -> Settings -> Environment Variables) add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy.
5. Open `/admin`: it shows "Database connected". Without these two variables the owner page warns that storage is temporary.

Keep the secret key private: it only goes in server environment variables, never in the browser or in git.
Note: Supabase free projects pause after about a week without use; upgrade or keep the site active for live use.

## Jobs the quote form handles
New roofs (slate/tile, measured or estimated roof size), repairs, flat roofs (GRP), gutters and fascias, chimney removal,
solar panels, and "something else" (no price, the owner calls). Every price except new roofs is editable on `/admin`
under "Other jobs"; new-roof prices are per material. All shipped numbers are placeholders until the owner confirms them.

## Testing
`scripts/agent-server.sh <port>` starts an isolated production server (own data folder, fake address data,
admin password `testpw`). Run `npm run build` first. Stop it with `kill $(lsof -tiTCP:<port> -sTCP:LISTEN)`.

## Security and privacy behaviour (preview)
- Input from the public form is validated strictly (types, lengths, UK phone/email/postcode) and only known fields are stored.
- Rate limits: per connection and per phone/email on enquiries, bookings and address search; failed owner logins lock out after 10 tries.
- Old enquiries are deleted automatically (6 months if never booked, 24 months otherwise), together with their stored messages.
- Consent time and wording version are stored with every enquiry. The owner page can export or delete a customer's data.
- Limits are held in memory per server, so on a serverless host add the host's firewall/rate limiting too.
