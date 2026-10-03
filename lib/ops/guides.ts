// Section tips for guided mode: what each page is for and the usual steps, in plain words.
// Shown at the top of each section until the user clicks "Got it" or turns tips off.

export type Guide = { title: string; steps: string[] };

export const PAGE_GUIDES: Record<string, Guide> = {
  "/admin": {
    title: "Dashboard: today at a glance",
    steps: [
      "The top cards show new enquiries, this week's visits and jobs, how many vans are working, and this month's costs. Click a card for the detail.",
      "“Needs your attention” lists what to sort out today: new hot leads, MOTs, tax and insurance running out, services due, penalty notices to answer.",
      "The sample vans, crew and jobs are made up. When you're ready, use “Clear sample data” and enter your own.",
    ],
  },
  "/admin/leads": {
    title: "Leads and quotes",
    steps: [
      "Every enquiry from the quote form lands here with its price range, photos and booked inspection.",
      "Click an enquiry to open it. Mark it Contacted, Quoted, Won or Lost as you go: that's what drives the pipeline and the project map.",
      "On a won enquiry use “Schedule the job” to give it dates, a van and a crew.",
    ],
  },
  "/admin/jobs": {
    title: "Jobs and schedule",
    steps: [
      "The Schedule tab shows the next two weeks: inspections customers booked online, and your roofing jobs.",
      "Click “Assign van and crew” on an inspection, or “New job” for a roofing job. Red warnings tell you about double-booked vans or crew, vans in the garage, and out-of-date MOT, insurance or CSCS cards.",
      "Start and finish a job with the buttons on its row. Vans on a started job show as “On the road”.",
    ],
  },
  "/admin/map": {
    title: "Project map",
    steps: [
      "Each pin is a customer project, coloured by how far it has got: enquiry, inspection booked, quoted, won, scheduled, in progress or complete.",
      "Click a pin or a row on the right for the customer, price, van and crew. Use the chips to show only some stages.",
      "Turn the Vans layer on to see where the vans are. Positions are samples until a tracker is connected.",
    ],
  },
  "/admin/vans": {
    title: "Vans",
    steps: [
      "“Add van” for a new vehicle: number plate, make, model, mileage and the MOT, tax and insurance dates.",
      "Click a van to see its deadlines, servicing, jobs, penalty notices and running costs.",
      "Take a van off the road (SORN) instead of deleting it, so its history is kept.",
    ],
  },
  "/admin/vans/": {
    title: "Van page",
    steps: [
      "Check the MOT, tax, insurance and service dates. Anything red or amber needs action.",
      "“Book service or repair” puts the van in the garage list; “Update mileage” keeps the service reminder accurate.",
      "Running costs at the bottom add up fuel, repairs and insurance for the last 90 days.",
    ],
  },
  "/admin/crew": {
    title: "Team",
    steps: [
      "“Add team member” with their role, phone and the dates on their licence, CSCS card, working-at-height training and first aid.",
      "Only people marked as drivers can be picked as the usual driver of a van.",
      "Expired cards and training show up on the dashboard and warn you when you schedule them on a job.",
    ],
  },
  "/admin/crew/": {
    title: "Team member page",
    steps: [
      "Keep their licence points and card dates up to date: this page feeds the warnings on the dashboard.",
      "See which van they usually drive and their recent jobs.",
    ],
  },
  "/admin/maintenance": {
    title: "Servicing and repairs",
    steps: [
      "“Book a service or repair” for a van. When it goes in, click “Van is in”: it shows as In the garage and can't be sent to jobs.",
      "When it comes back click “Finish and release” and enter the final cost: it becomes a cost against that van, and service and MOT dates move on.",
      "Vans nearing their service by miles or date are listed on the left.",
    ],
  },
  "/admin/fines": {
    title: "Fines and penalty notices",
    steps: [
      "Record each parking, speeding or bus-lane notice with its reference. The 28-day deadline to name the driver and the 14-day reduced-payment date are worked out for you.",
      "The driver is suggested from whoever had that van on the day. Mark “Driver named” once you've replied.",
      "If the company pays, mark it Paid and it's added to your costs.",
    ],
  },
  "/admin/costs": {
    title: "Costs",
    steps: [
      "Add fuel, repairs, insurance and other van costs as they happen. Finished servicing and paid fines are added automatically.",
      "See where the money goes by category and by van, and compare months.",
    ],
  },
  "/admin/documents": {
    title: "Documents and deadlines",
    steps: [
      "Everything with an expiry date in one list: MOT, tax, insurance, breakdown cover, driving licence checks, CSCS cards, height training and first aid.",
      "Click an item to go to the van or team member and update the date once renewed.",
    ],
  },
  "/admin/reports": {
    title: "Reports",
    steps: [
      "Pick a report, check it, then press Print to print or save it as a PDF.",
      "Use them for the accountant (costs), insurance renewals (van list) and your own weekly look at the pipeline.",
    ],
  },
  "/admin/pricing": {
    title: "Quote prices and settings",
    steps: [
      "These prices drive the instant quote customers see. Change a number, then press Save.",
      "“Pause” stops new work being promised: customers join a waiting list instead.",
      "Set your phone, email and the postcode areas you cover.",
    ],
  },
  "/admin/messages": {
    title: "Messages",
    steps: [
      "Every text and email the system sends or would send. “Preview” means nothing was really sent yet because text and email aren't switched on.",
    ],
  },
  "/admin/activity": {
    title: "Activity log",
    steps: ["A running record of what changed in the dashboard: vans, jobs, servicing, notices and costs."],
  },
};

export function guideFor(path: string): { id: string; g: Guide } | null {
  const clean = path.replace(/\/$/, "") || "/admin";
  if (PAGE_GUIDES[clean]) return { id: clean, g: PAGE_GUIDES[clean] };
  const detail = Object.keys(PAGE_GUIDES).find((k) => k.endsWith("/") && clean.startsWith(k));
  return detail ? { id: detail, g: PAGE_GUIDES[detail] } : null;
}
