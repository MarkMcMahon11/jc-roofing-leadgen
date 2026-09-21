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
- Owner page: `/admin` (password from `ADMIN_PASSWORD`)
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
| Scheduler embed | `NEXT_PUBLIC_CALENDLY_URL` (webhooks need a paid Calendly plan; webhook endpoint `/api/calendly`) |

Before going live also: replace JSON storage with a managed database, use a commercial-allowed host,
add real authentication to `/admin`, and have JC Roofing approve the privacy notice and trust claims.
