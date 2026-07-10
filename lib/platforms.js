// platforms.js - display metadata for each job board JobGrab can scrape from.
// Real logo bitmaps would mean bundling trademarked assets and reaching out
// to each site's CDN (a CSP/host-permission cost for a purely cosmetic
// badge), so instead each platform gets a small colored initial badge in its
// brand color -- same visual language as the rest of the app's icon set,
// with a text label as the source of truth (the badge is a hint, not the
// only way to tell platforms apart). Colors are close approximations of
// each brand's primary color, not pixel-exact swatches.
export const PLATFORMS = {
  linkedin:  { label: "LinkedIn",  abbr: "in", color: "#0A66C2" },
  indeed:    { label: "Indeed",    abbr: "id", color: "#2164F3" },
  naukri:    { label: "Naukri",    abbr: "nk", color: "#4B5EAA" },
  wellfound: { label: "Wellfound", abbr: "wf", color: "#3A3A3A" },
  glassdoor: { label: "Glassdoor", abbr: "gd", color: "#0CAA41" },
  manual:    { label: "Manual",    abbr: "+",  color: "#8A8F98" },
};

export function platformInfo(source) {
  return PLATFORMS[source] || { label: source ? source : "Unknown", abbr: "?", color: "#8A8F98" };
}
