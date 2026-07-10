// scraper-naukri.js - Naukri.com job extraction. Naukri's DOM classnames are
// hashed/rotated more aggressively than LinkedIn's or Indeed's and it does not
// reliably embed JobPosting JSON-LD, so this leans harder on generic
// heading/URL structure and a broad "short text near the title" scan for
// salary/experience/location chips, mirroring the LinkedIn scraper's "pills"
// approach without depending on any specific class name.

(function () {
  const L = window.__jobGrabLib || {};
  const clean = L.clean || ((s) => (s || "").trim());

  // Job ids sit as trailing digits on a /job-listings-...-<id> URL.
  function jobKey() {
    const m = location.pathname.match(/-(\d{6,})(?:[/?#]|$)/);
    return m ? m[1] : null;
  }
  function onJobPage() { return /\/job-listings-/.test(location.pathname) || !!jobKey(); }

  // Short, plausible chips (salary/experience/location) near the header --
  // Naukri renders these as a row of small spans/divs with no stable class.
  function nearbyChips(root) {
    if (!root) return [];
    const scope = root.closest("header, section, div[class]") || root.parentElement || document.body;
    return Array.from(scope.querySelectorAll("span, div, li"))
      .map((n) => clean(n.textContent))
      .filter((t) => t && t.length < 60);
  }

  function scrape() {
    const ld = L.fromJsonLd ? L.fromJsonLd() : null;
    const id = jobKey();

    const titleEl = document.querySelector("h1");
    const title = clean(titleEl && titleEl.textContent) || clean(ld && ld.title);

    const companyEl = document.querySelector("h1 + div a, a[href*='naukri.com'][title]");
    const company =
      (L.pick && L.pick(["a.comp-name", "[class*='comp-name']", "[class*='companyName']"])) ||
      clean(companyEl && companyEl.textContent) ||
      clean(ld && ld.hiringOrganization && ld.hiringOrganization.name);
    const companyUrl = companyEl && companyEl.href ? companyEl.href.split("?")[0] : (ld && ld.hiringOrganization && ld.hiringOrganization.sameAs) || "";

    const chips = nearbyChips(titleEl);
    const jobLocation =
      chips.find((t) => /,\s*[A-Za-z .]+$/.test(t) && t.length < 40 && !/\d/.test(t)) ||
      clean(ld && ld.jobLocation && ld.jobLocation.address && ld.jobLocation.address.addressLocality);
    const salary = chips.find((t) => /\b(lpa|lakh|₹|per annum)\b/i.test(t)) || (L.salaryFromLd && L.salaryFromLd(ld)) || "";
    const experience = chips.find((t) => /\byears?\b/i.test(t) && /\d/.test(t)) || "";

    const descEl = document.querySelector("[class*='job-desc'], [class*='JobDescription'], .styles_JDC__dang-inner-html__h0K4t");
    const descriptionHtml = descEl ? descEl.innerHTML : clean(ld && ld.description);

    const postedAt = (L.toDate && L.toDate(ld && ld.datePosted)) || "";

    if (!title && !company) return null;

    return {
      source: "naukri",
      externalId: id,
      title, company, companyUrl,
      location: jobLocation || "",
      workplaceType: /remote/i.test(jobLocation || "") ? "Remote" : "",
      employmentType: "",
      applicants: experience ? `Experience: ${experience}` : "",
      salary,
      url: location.href.split("?")[0],
      applyUrl: "",
      postedText: "",
      postedAt, posted: postedAt,
      deadline: "",
      contactName: "", contactLinkedIn: "", contactTitle: "",
      descriptionHtml,
      scrapedFrom: location.href,
    };
  }

  window.__jobGrabSource = "naukri";
  window.__jobGrabCurrentId = jobKey;
  window.__jobGrabOnJobPage = onJobPage;
  window.__jobGrabScrape = function () {
    try { return scrape(); } catch (e) {
      try { console.warn("[JobGrab] naukri scrape error", e); } catch (_) {}
      return null;
    }
  };
})();
