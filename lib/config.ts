// Business facts used in more than one place. Change here, not in components or messages.
export const BUSINESS = {
  name: "JC Roofing Dumfries",
  phone: "07808 528293",
  email: "jamie@jcroofingdumfries.com",
  address: "28 Auchenkeld Avenue, Heathhall, Dumfries DG1 3QX",
};
export const telHref = `tel:${BUSINESS.phone.replace(/\s/g, "")}`;

// Recorded with every lead so we can show exactly what the customer agreed to.
export const CONSENT_VERSION = "2026-09-21-v1";

// Data retention (matches /privacy): unbooked enquiries 6 months, everything else 24 months.
export const RETAIN_UNBOOKED_DAYS = 183;
export const RETAIN_ALL_DAYS = 730;
