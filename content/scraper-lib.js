// scraper-lib.js - parsing helpers shared by every per-site scraper
// (scraper-linkedin.js, scraper-indeed.js, scraper-naukri.js,
// scraper-wellfound.js, scraper-glassdoor.js). Loaded first in each site's
// content_scripts entry so it's in the page's shared JS world before the
// site-specific script runs. schema.org JobPosting JSON-LD is the most
// portable signal across job boards -- most of them embed it for SEO even
// when their visible DOM markup is heavily obfuscated/rotated -- so every
// scraper tries it first and falls back to hand-picked selectors.

(function () {
  function clean(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  function fromJsonLd() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        const nodes = Array.isArray(data) ? data : Array.isArray(data && data["@graph"]) ? data["@graph"] : [data];
        for (const n of nodes) if (n && n["@type"] === "JobPosting") return n;
      } catch (_) {}
    }
    return null;
  }

  function pick(selectors, root) {
    root = root || document;
    for (const sel of selectors) {
      const node = root.querySelector(sel);
      if (node && clean(node.textContent)) return clean(node.textContent);
    }
    return "";
  }

  function pickAttr(selectors, attr, root) {
    root = root || document;
    for (const sel of selectors) {
      const node = root.querySelector(sel);
      if (node && node.getAttribute(attr)) return node.getAttribute(attr);
    }
    return "";
  }

  function toDate(v) {
    if (!v) return "";
    const d = new Date(v);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }

  function salaryFromLd(ld) {
    if (!ld || !ld.baseSalary || !ld.baseSalary.value) return "";
    const v = ld.baseSalary.value;
    const min = v.minValue, max = v.maxValue, cur = ld.baseSalary.currency || "";
    if (min == null && max == null) return "";
    return `${min || ""}${min != null && max != null ? "-" : ""}${max || ""} ${cur}`.trim();
  }

  window.__jobGrabLib = { clean, fromJsonLd, pick, pickAttr, toDate, salaryFromLd };
})();
