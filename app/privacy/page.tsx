import Link from "next/link";
import { BUSINESS } from "@/lib/config";

export const metadata = { title: `Privacy notice – ${BUSINESS.name}` };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-8 leading-relaxed">
      <Link href="/" className="text-mute underline">← Back to your quote</Link>
      <h1 className="text-2xl font-bold">Privacy notice</h1>
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Draft for preview. The wording must be reviewed and approved by JC Roofing (and ideally checked against ICO guidance) before this goes live.</p>

      <h2 className="text-lg font-bold">Who we are</h2>
      <p>{BUSINESS.name}, {BUSINESS.address}, is the controller of the information you give us here.</p>

      <h2 className="text-lg font-bold">What we collect and why</h2>
      <p>Your name, mobile number, email, the property address, details you choose about the roof, and any inspection time you book. We also record when you gave your consent and which version of the wording you saw. We use this only to give you a price estimate, contact you about your enquiry, and arrange and carry out an inspection.</p>
      <p>If you choose to add photos, they are entirely optional. We store them to help prepare for your inspection, and, where we have switched this on, an AI service looks at each photo and gives a short, rough read (the likely material and roughly how much looks affected) shown to you and to us. This is never a survey and never a fixed price.</p>
      <p>We also count, anonymously, how far people get through this form (for example &quot;reached step 3&quot;) so we can make it easier to use. These counts contain no personal information.</p>

      <h2 className="text-lg font-bold">Who else handles it</h2>
      <p>The JC Roofing team, and the services that run this page on our behalf. They handle it only on our instructions:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Address search:</b> the address or postcode you type is sent to an address service to suggest matches: OpenStreetMap-based search (Photon), the free Postcodes.io service to check postcodes, or Google Maps if we switch it on.</li>
        <li><b>Hosting and storage:</b> our website host and database.</li>
        <li><b>Messages:</b> text message and email providers that deliver your estimate and booking confirmation.</li>
        <li><b>Suppliers:</b> when we order materials for your job we give the supplier the address of your property so they can deliver. We do not give them your phone number or email unless you ask us to.</li>
        <li><b>WhatsApp:</b> if you message our WhatsApp number, WhatsApp (Meta) carries the conversation. An automated assistant, powered by Anthropic&apos;s Claude, reads your message and replies on our behalf, and passes what you ask for to the team. It cannot agree prices or dates. Say STOP and it will not message you again. We keep these conversations for 90 days, then delete them.</li>
        <li><b>Booking:</b> our booking tool, if we use one.</li>
        <li><b>Photos:</b> if you add any, they are stored with our hosting provider. Where the AI read is switched on, a photo is also sent to Anthropic (the company behind Claude) to generate that read.</li>
      </ul>
      <p>We do not sell your information. To help prevent misuse of this form, our systems briefly note your internet address to limit how often it can be used.</p>

      <h2 className="text-lg font-bold">This browser</h2>
      <p>While you fill in the form, your answers are kept in this browser tab only, so a refresh doesn&apos;t lose them. They are not sent anywhere until you press &quot;Show my price&quot;, and they disappear when you close the tab.</p>

      <h2 className="text-lg font-bold">How long we keep it</h2>
      <p>Enquiries that do not lead to a booked inspection or a job are deleted after 6 months. Other customer records are kept for up to 24 months after the last contact. Deleted enquiries are removed together with the messages and any photos we stored about them.</p>

      <h2 className="text-lg font-bold">Your rights</h2>
      <p>You can ask to see (get a copy of), correct or delete your information, or withdraw consent, at any time by calling {BUSINESS.phone} or emailing {BUSINESS.email}. You can also complain to the Information Commissioner&apos;s Office (ico.org.uk).</p>
    </main>
  );
}
