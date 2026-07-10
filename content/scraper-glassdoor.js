// scraper-glassdoor.js - Glassdoor job extraction. Glassdoor embeds
// JobPosting JSON-LD on most job-listing pages, which is the primary path
// since Glassdoor's visible DOM classnames rotate frequently and much of the
// page sits behind a login/paywall overlay that this scraper doesn't try to
// defeat -- it only reads what's already rendered.

(function () {
  const L = window.__jobGrabLib || {};
  const clean = L.clean || ((s) => (s || "").trim());

  // Job-listing URLs carry a numeric id, e.g. .../job-listing/...-JV_...
  // or a `jl` query param on some locales; fall back to the JD_KEY path segment.
  // On a search page (e.g. /Job/index.htm, /Job/<location>-<query>-jobs-SRCH_...htm)
  // clicking a card opens a detail pane WITHOUT necessarily updating the URL,
  // so as a last resort scan inline <script> JSON (Glassdoor's React app embeds
  // the open listing's id in its initial state) for a jobListingId-shaped field.
  function jobKey() {
    let u; try { u = new URL(location.href); } catch (_) { return null; }
    const jl = u.searchParams.get("jl");
    if (jl) return jl;
    const m = location.pathname.match(/-JV_(?:[A-Za-z0-9]+_)?KO0?,\d+_KE\d+,\d+_(\d+)\.htm/) || location.pathname.match(/jobListingId=(\d+)/);
    if (m) return m[1];
    for (const s of document.querySelectorAll("script:not([src])")) {
      const t = s.textContent;
      if (!t || t.length > 2_000_000) continue; // skip huge unrelated bundles
      const jm = t.match(/"jobListingId"\s*:\s*"?(\d{5,})"?/) || t.match(/"listingId"\s*:\s*"?(\d{5,})"?/);
      if (jm) return jm[1];
    }
    return null;
  }
  // Any /Job/ page (search results OR a dedicated listing) counts as "on a
  // job context" -- if nothing is actually selected, scrape() below returns
  // null and the save panel asks for a title/company instead of silently
  // capturing nothing, so this errs toward showing the button rather than
  // hiding it on pages where a job legitimately is open.
  function onJobPage() {
    return /\/job-listing\//i.test(location.pathname) || /\/Job\//i.test(location.pathname) ||
      !!jobKey() || !!(L.fromJsonLd && L.fromJsonLd());
  }

  function scrape() {
    const ld = L.fromJsonLd ? L.fromJsonLd() : null;
    const id = jobKey();

    const title = (L.pick && L.pick(["h1[id*='jd-job-title']", "h1"])) || clean(ld && ld.title);
    const companyEl = document.querySelector("[class*='EmployerProfile'] a, a[href*='Overview/']");
    const company = clean(companyEl && companyEl.textContent) || clean(ld && ld.hiringOrganization && ld.hiringOrganization.name);
    const companyUrl = companyEl && companyEl.href ? companyEl.href.split("?")[0] : (ld && ld.hiringOrganization && ld.hiringOrganization.sameAs) || "";

    const jobLocation = clean(ld && ld.jobLocation && ld.jobLocation.address && ld.jobLocation.address.addressLocality) ||
      (L.pick && L.pick(["[data-test='location']"])) || "";
    const salary = (L.salaryFromLd && L.salaryFromLd(ld)) || (L.pick && L.pick(["[data-test*='salary']", "[class*='salary']"])) || "";
    const employmentType = clean(ld && ld.employmentType) || "";

    const descEl = document.querySelector("[class*='JobDetails_jobDescription'], #JobDescriptionContainer");
    const descriptionHtml = descEl ? descEl.innerHTML : clean(ld && ld.description);

    const postedAt = (L.toDate && L.toDate(ld && ld.datePosted)) || "";
    const deadline = (L.toDate && L.toDate(ld && ld.validThrough)) || "";

    if (!title && !company) return null;

    return {
      source: "glassdoor",
      externalId: id,
      title, company, companyUrl,
      location: jobLocation,
      workplaceType: /remote/i.test(jobLocation) ? "Remote" : "",
      employmentType,
      applicants: "",
      salary,
      url: location.href.split("?")[0],
      applyUrl: "",
      postedText: "",
      postedAt, posted: postedAt,
      deadline,
      contactName: "", contactLinkedIn: "", contactTitle: "",
      descriptionHtml,
      scrapedFrom: location.href,
    };
  }

  window.__jobGrabSource = "glassdoor";
  window.__jobGrabCurrentId = jobKey;
  window.__jobGrabOnJobPage = onJobPage;
  window.__jobGrabScrape = function () {
    try { return scrape(); } catch (e) {
      try { console.warn("[JobGrab] glassdoor scrape error", e); } catch (_) {}
      return null;
    }
  };
})();
