import Link from "next/link";

export const metadata = { title: "Privacy notice – JC Roofing Dumfries" };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-8 leading-relaxed">
      <Link href="/" className="text-mute underline">← Back to your quote</Link>
      <h1 className="text-2xl font-extrabold">Privacy notice</h1>
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Draft for preview. The wording must be reviewed and approved by JC Roofing (and ideally checked against ICO guidance) before this goes live.</p>
      <h2 className="text-lg font-bold">Who we are</h2>
      <p>JC Roofing Dumfries, 28 Auchenkeld Avenue, Heathhall, Dumfries DG1 3QX, is the controller of the information you give us here.</p>
      <h2 className="text-lg font-bold">What we collect and why</h2>
      <p>Your name, mobile number, email, the property address, details you choose about the roof, and any inspection time you book. We use these only to give you a price estimate, contact you about your enquiry, and arrange and carry out an inspection.</p>
      <h2 className="text-lg font-bold">Who sees it</h2>
      <p>The JC Roofing team, and the service providers that run this page (hosting, address search, text and email delivery, booking). They process it only on our instructions. We do not sell your information.</p>
      <h2 className="text-lg font-bold">How long we keep it</h2>
      <p>Enquiries that do not lead to a booking are deleted after 6 months. Customer records are kept for up to 24 months after the job or last contact.</p>
      <h2 className="text-lg font-bold">Your rights</h2>
      <p>You can ask to see, correct or delete your information, or withdraw consent, at any time by calling 07808 528293 or emailing jamie@jcroofingdumfries.com. You can also complain to the Information Commissioner&apos;s Office (ico.org.uk).</p>
    </main>
  );
}
