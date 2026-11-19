// Browser-safe Supabase configuration. Publishable key is intended for client use.
window.VECTRA_SUPABASE_CONFIG = {
  url: "https://mdbeebugcaqzjpemecub.supabase.co",
  anonKey: "sb_publishable_S-euaPF9suaE7ms5OvFfzA_zSmKV3Ku"
};
// Public website address (used by tools/build_seo.py for canonical links and the sitemap).
window.VECTRA_SITE_URL = "https://vectra-enterprises.vercel.app";

// ---- Business details shown on the public site. Leave a value empty ("") to hide it. ----
// Only add facts that are true and that you can prove (buyers and PSUs check them).
window.VECTRA_COMPANY = {
  gstin: "",            // e.g. "24ABCDE1234F1Z5" — shown in the trust strip and footer
  established: "",      // year you started, e.g. "2019"
  hours: "",            // e.g. "Mon–Sat, 10:00 AM – 7:00 PM"
  quoteTurnaround: "",  // e.g. "within 1 working day" (only promise what you can keep)
  serviceArea: "Vadodara, Gujarat and across India", // edit if you do not ship nationwide
  authorisedBrands: ""  // optional note, e.g. "Authorised dealer for X, Y" (only if true)
};
// Optional Google Analytics 4 ID, e.g. "G-XXXXXXXXXX". Leave empty to disable analytics.
window.VECTRA_GA_ID = "";
