# PRD: JC Roofing Instant Quote & Inspection Booking

| | |
|---|---|
| **Client** | JC Roofing Dumfries (28 Auchenkeld Avenue, Heathhall, Dumfries DG1 3QX) |
| **Owner / decision maker** | JC Roofing business owner **[assumed: Jamie, per the contact email on the website; confirm]** |
| **Status** | Draft v1 · 2026-09-21 · MVP built, in preview |
| **Product lead** | Mark |
| **Repo** | `~/Desktop/jc-roofing-app` · preview at `localhost:3000` and `/preview.html` |

Statements marked **[assumed]** are my working assumptions and need owner confirmation. Statements marked **[verified]** were checked against a source (see Appendix B).

---

## 1. Summary

Today every prospective customer is routed to the owner and must be spoken to on the phone before anything happens. A large share of those calls are dead ends: outside the service area, not a real project, budget nowhere near reality, or a start date the crew cannot meet. This costs the owner hours, and slow replies lose jobs to whoever answers first.

This product is a mobile-first web app, branded to JC Roofing, that takes a prospect from **address → roof details → instant price range → honest start window → booked inspection** in about two minutes with no phone call. The owner receives an instant alert containing only qualified leads, with everything needed to decide. Non-fits are handled politely by the app and never reach the owner.

**One-line success test:** the owner's phone rings only for people who already have a price, a start window, and an inspection booked.

## 2. Problem and evidence

- **Owner time is the bottleneck.** A small business runs on the owner's availability; every qualifying call is unbilled time.
- **Speed decides who wins the job.** Industry studies consistently report that responding within about 5 minutes makes a lead many times more likely to convert (commonly cited ~21x), and that a majority of customers hire the first responder [verified, Appendix B]. A call-back process cannot match instant.
- **Backlog is a real constraint.** The business is a small contractor that is typically on backorder [per owner]. Customers who cannot wait waste effort on both sides if this is discovered late.
- **Price ambiguity causes drop-off.** Customers who cannot get any price signal without a call often move on.

## 3. Goals and non-goals

### Goals
1. Cut owner time spent on unqualified enquiries.
2. Respond to every enquiry instantly, 24/7.
3. Convert qualified leads to booked inspections with minimal friction.
4. Set honest expectations on price and start date before any human contact.
5. Be simple enough that a non-technical customer and a non-technical owner never need help.

### Non-goals (v1)
- Exact fixed quotes without an inspection.
- Online payment or deposits.
- Full CRM, invoicing, job costing, or crew scheduling.
- Multi-tenant SaaS for other trades (kept in mind, not built).
- Insurance-claim workflows.

## 4. Users

| User | Needs | Notes |
|---|---|---|
| **Homeowner (primary)** | A fast, trustworthy price idea; no jargon; easy booking; confidence the firm is legitimate | Often on a phone; may have an active leak; mixed age and tech comfort |
| **Owner (primary)** | Only warm leads; instant, scannable alert; control of prices and capacity with no training | Non-technical; will use a phone; must be able to pause intake |
| **Landlord / property manager (secondary)** | Same flow for multiple properties | Not optimised in v1 |

## 5. Scope

### In scope for v1
- Customer flow (5 questions + result + booking).
- Instant price range and start window.
- Lead qualification (hot / warm / not-a-fit) and routing.
- Owner alerts, owner settings page, simple lead list.
- Address search with verification; postcode validation.
- Brand styling per JC Roofing logo and site.
- Privacy and consent.

### Backlog / later
- Photo upload to speed inspections.
- Calendar-driven start dates (reads job calendar).
- Roof measurement from satellite data (Google Solar) or OSM building footprints.
- Support for services beyond re-roofing (see Open Questions).
- Reactivation follow-ups for unbooked leads.

## 6. Customer journey and requirements

**Target: under 2 minutes, five screens, one question group per screen.**

| # | Screen | Inputs | Requirements |
|---|---|---|---|
| 1 | **Address** | Address search | Suggest addresses as the customer types; require a selection (or manual fallback); confirm with a green "Address confirmed" card; show trust chips and a phone number |
| 2 | **Home** | Property type, age band, listed / conservation area | Tap targets only; "Not sure" allowed on listed status |
| 3 | **Roof** | Job type, material, colour | Materials as cards with a one-line benefit; colours shown as swatches; colour list depends on material |
| 4 | **Timing** | Urgency | Three options; "leaking" triggers the urgent path |
| 5 | **Contact** | Name, mobile, email, consent | Consent checkbox is mandatory and specific; contact details are asked *before* the price is revealed |
| Result | **Price and booking** | Choose inspection slot | Price range, roof size, earliest-start window, booking calendar, alternative phone number |

### Functional requirements

**FR-1 Address capture**
- FR-1.1 Predict addresses as the customer types (min 3 characters, debounced).
- FR-1.2 Selection populates address, postcode and coordinates. Manual entry remains available via "I can't find my address".
- FR-1.3 Manual postcodes must match UK format and exist (checked against a postcode service). Non-existent postcodes are rejected with a plain-language message.
- FR-1.4 Street-level results require the customer to add a house number/name and confirm the postcode.
- FR-1.5 Address search must never block a customer: if the provider fails, fall back to manual entry.

**FR-2 Qualification**
- FR-2.1 In-area check by postcode area (default `DG`; owner-editable).
- FR-2.2 Score: *hot* (in area and wants work within 3 months or urgent), *warm* (in area, pricing only or unsure), *not-a-fit* (out of area).
- FR-2.3 Not-a-fit customers get a polite explanation and a confirmation message; the owner is not alerted.
- FR-2.4 A pause switch converts the flow into a waiting-list mode with a visible "we're very busy" note.

**FR-3 Price range**
- FR-3.1 Range = roof area × owner rate per m² for the chosen material, with modifiers, shown as approximately −10% to +20%, rounded to £100.
- FR-3.2 Modifiers: repair vs full job, tenement access, pre-1919 build, listed / conservation area. A minimum job value applies.
- FR-3.3 The price is always labelled an estimate, confirmed at a free inspection.
- FR-3.4 Roof area comes from satellite data when available, otherwise a property-type estimate.

**FR-4 Start window**
- FR-4.1 Show the earliest start as a month, never a specific date, with a caveat about queue and weather.
- FR-4.2 v1 source: owner-entered "weeks until crew is free" or a manual date. Phase 2: derive from the job calendar and estimated job duration.

**FR-5 Inspection booking**
- FR-5.1 Embedded scheduler prefilled with name, email and address.
- FR-5.2 A booking updates the lead with the inspection time (requires scheduler webhooks, see §9).
- FR-5.3 If no scheduler is configured, the customer sees a clear message that the owner will text to arrange a time.

**FR-6 Notifications**
- FR-6.1 Customer receives an immediate confirmation containing the price range and start window.
- FR-6.2 Owner receives an immediate alert for hot and warm leads: name, address, material, size, price range, timing, phone, and a map link.
- FR-6.3 Manually typed addresses are flagged for checking.

**FR-7 Owner page** (password-protected)
- Settings: pause, weeks until crew free, minimum job value, coverage postcodes, owner phone and email, price per m² per material.
- Leads list: score badge, key details, tap-to-call, status (new, contacted, quoted, won, lost).

**FR-8 Brand and content**
- Logo header, brand red, charcoal and cream palette, Inter typeface, trust chips (Trusted Trader, 50+ reviews, 250+ customers), business address in the footer. Claims must be kept in sync with the business's own website.

## 7. UX principles

1. **One thing per screen; taps over typing.** Free text only where unavoidable (address, name, phone, email).
2. **Show progress and time.** "Step 2 of 5 · about 75 seconds left".
3. **Reassure before asking.** Trust chips and a phone number are visible from the first screen.
4. **Honest ranges.** Never imply a fixed quote or a guaranteed date.
5. **Always a way out.** Phone number on every screen; manual address fallback; polite out-of-area screen.
6. **Accessible by default.** Minimum 44px tap targets, high-contrast brand colours, keyboard-operable address search, labelled fields, visible focus rings, screen-reader announcements for search status. Target WCAG 2.2 AA.
7. **Works on a bad connection.** Small payload, no heavy client libraries beyond the scheduler embed.

## 8. Success metrics

Baselines are unknown and must be collected from the owner for the last 3 months **[assumed: not tracked today]**. Targets below are proposals to validate.

| Metric | Definition | Proposed target |
|---|---|---|
| Completion rate | Started flow → reached price screen | ≥ 55% |
| Booking rate | Reached price screen → booked inspection | ≥ 25% |
| Time to complete | Median, screen 1 → price | ≤ 2 min |
| Owner time saved | Calls avoided per week × ~10 min | Report weekly |
| Qualified share | Leads scored hot or warm that reach the owner | ≥ 85% of alerts are genuine |
| Response time | Enquiry → customer confirmation | < 1 min (target: instant) |
| Inspection show-up rate | Booked inspections attended | ≥ 85% |
| Win rate on inspected leads | Quoted → won | Track vs pre-app baseline |

Instrumentation: log each step reached and drop-off point (no personal data in analytics events).

## 9. Integrations and cost model

**Principle:** preview and development cost nothing; paid tools are licensed at deployment. Every paid dependency has a free preview stand-in, so nothing blocks the launch of the build.

| Capability | Preview / development (free) | Launch (to be licensed) | Notes |
|---|---|---|---|
| Address search | OpenStreetMap search (Photon) + Postcodes.io, cached and rate-capped | **Google Places API (New)**, key-activated, zero code changes | Public Photon throttles heavy use (~1 request/second) [verified]; free mode is for preview only. Google requires attribution when results are shown without a map |
| Roof measurement | Property-type estimate | Google Solar API (or paid aerial reports) | Optional free upgrade to test: OSM building footprint × pitch factor |
| Booking | Placeholder message / mock calendar | Scheduler with webhooks | **Calendly free has no webhooks; a paid plan is required** [verified]. Cal.com is an alternative worth evaluating (free plan permits unlimited bookings, one user [verified]; confirm webhook availability on the chosen plan) |
| SMS | Logged to console | Twilio (or similar) with UK sender registration | Requires consent capture (already built) |
| Email | Logged to console | Resend or equivalent | Verified sending domain needed |
| Hosting | Local | Production host | Vercel's free Hobby plan is **non-commercial only** [verified]; a commercial deployment needs a paid plan or another host |
| Database | JSON files (dev only) | Managed Postgres (e.g. Supabase) | JSON storage does not work on serverless hosts |
| Calendar (phase 2) | Manual "weeks free" | Google Calendar read-only access | Separate read-only OAuth scope |

Budget owner: to be confirmed. Recommend the owner approve a monthly ceiling before licensing.

## 10. Data, privacy and compliance (UK GDPR / PECR)

- **Lawful basis:** consent for contact about the enquiry; explicit, unticked checkbox with plain-language wording (built).
- **Data collected:** name, mobile, email, property address and coordinates, property details, choices, timing, inspection time.
- **Retention:** propose 24 months for won/lost customers, 6 months for unbooked leads, then delete or anonymise **[assumed]**.
- **Rights:** owner must be able to export and delete a lead on request (admin action to add before launch).
- **SMS marketing:** transactional messages about the enquiry only; any promotional messaging needs separate opt-in.
- **Security:** admin behind a password (upgrade to proper authentication before launch); API keys server-side only; Places endpoints rate-limited; no personal data in URLs or analytics.
- **Privacy notice:** link on the consent line and footer before launch; owner is the data controller.
- **Third parties:** list every processor (host, database, SMS, email, maps, scheduler) in the privacy notice.

## 11. Technical overview (as built)

- **Stack:** Next.js (App Router), React, Tailwind, TypeScript. Routes: `/` (customer flow), `/admin` (owner), `/api/quote`, `/api/places/*`, `/api/calendly`, `/api/admin`.
- **Key modules:** `lib/pricing.ts` (range, scoring, coverage, start date), `lib/places.ts` (address providers), `lib/roof.ts` (roof area), `lib/notify.ts` (alerts), `lib/store.ts` (storage).
- **Provider switch:** address search uses Google when `GOOGLE_MAPS_API_KEY` is set, otherwise the free provider.
- **Lead record:** contact, address (+ Google place ID and coordinates when verified), property answers, roof area and source, price low/high, earliest start, score, status, inspection time.

## 12. Phases and milestones

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 Preview (done)** | Branded clickable preview; working MVP with mock notifications; free address search | Owner has seen and approved the flow and wording |
| **1 Pilot** | Real rates and coverage; database; email alerts; booking with webhooks; hosted privately | 10 real past enquiries replayed; owner comfortable with alerts |
| **2 Launch** | Public link and website embed; SMS; privacy notice; analytics | Metrics in §8 tracked from day one |
| **3 Backlog engine** | Calendar-driven start dates; job-duration model | Start window matches owner's own estimate on 8 of 10 test cases |
| **4 Polish** | Photo upload, reactivation follow-ups, satellite roof size, extra service types | Driven by drop-off data |

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Rates or roof estimates are wrong, so ranges mislead | Lost trust, unprofitable jobs | Owner sets rates; ranges not quotes; review the first 20 leads against inspected prices; widen range if error is high |
| Estimated roof size is inaccurate without satellite data | Range off by ±30% | Clearly labelled estimate; upgrade to measured area at launch |
| Customers abandon at the contact step | Lower completion | Test placement; keep consent wording short; measure drop-off |
| Start-date promise misread as a guarantee | Complaints | Month-only display and explicit caveat |
| SMS/email deliverability | Missed alerts | Owner alerts on two channels; verified sending domain |
| Spam or fake leads | Wasted owner time | Rate limiting, honeypot field, postcode existence check, consent required |
| Free address provider unavailable or throttled | Address friction | Manual fallback always available; Google at launch |
| Owner does not keep settings current | Stale prices or capacity | Weekly reminder text; pause switch; last-updated date visible |
| Claims on the page drift from reality (reviews, customers) | Reputation, ASA advertising rules | Owner confirms trust claims before launch; review quarterly |

## 14. Open questions

1. **Real rates.** What does JC Roofing charge per m² by material, and what is the true minimum job value?
2. **Services.** The website also lists GRP flat roofs, gutters and fascias, leadwork, rooflights and drone surveys. Should the app offer an "Other work" route straight to a call or booking?
3. **Coverage.** Is `DG` the correct and complete service area, or are there exceptions and adjacent areas?
4. **Capacity.** How many crews, and how many m² per day per material? Is a manual "weeks until free" figure acceptable at launch?
5. **Booking tool.** Is the owner already on Calendly, Google Calendar or nothing? Which will be licensed?
6. **Baselines.** How many enquiries per week, how many become inspections, and how many jobs are won today?
7. **Budget.** What monthly ceiling for hosting, maps, SMS and scheduling?
8. **Channel.** Should leads also arrive by WhatsApp, or is SMS and email enough?
9. **Website.** Will this be embedded into the existing site or live on a separate link?
10. **Trust claims.** Confirm current wording for Trusted Trader, review count and customer count.

## 15. Acceptance criteria for pilot

- A new customer completes the flow on a mid-range phone in under 2 minutes without help.
- An address typed with a typo can be corrected by picking a suggestion; a non-existent postcode is rejected with a clear message.
- Price ranges for 10 replayed enquiries fall within an owner-acceptable band of the price actually quoted.
- Out-of-area enquiries produce a polite response and no owner alert.
- Owner receives a complete alert within 60 seconds of a hot lead and can change a rate or pause intake in under 30 seconds.
- Consent is required, recorded, and visible on each lead.
- No paid key is needed to run the preview; adding the Google key switches address search with no code change.

---

## Appendix A: Brand reference
- **Logo:** red rooftop mark, charcoal "JC" and red "ROOFING" wordmark.
- **Palette:** brand red `#b11017`, charcoal `#34342b`, cream `#f4f4eb`, sand `#d6d4c7`, accent gold `#ffb507` (stars, focus rings).
- **Typeface:** Inter.
- **Voice:** professional yet approachable; reliable, local, fully certified.

## Appendix B: Sources
- Speed-to-lead benchmarks: contractorincharge.com, customerflows.com (contractor lead-response studies).
- Google Solar API `buildingInsights` and Places API (New) Autocomplete / Place Details: developers.google.com/maps documentation.
- Calendly webhooks require a paid plan: developer.calendly.com FAQ and help centre.
- Cal.com free plan: cal.com pricing pages.
- Vercel Hobby plan is non-commercial: vercel.com/docs/plans/hobby.
- Photon public API fair-use throttling: github.com/komoot/photon, photon.komoot.io.
- Postcodes.io open UK postcode API: postcodes.io.
- Brand facts: jcroofingdumfries.com.
