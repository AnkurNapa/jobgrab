// scraper-wellfound.js - Wellfound (formerly AngelList Talent) job extraction.
// Wellfound reliably embeds JobPosting JSON-LD, so that's the primary path;
// DOM selectors are a thin fallback for the title/company only.

(function () {
  const L = window.__jobGrabLib || {};
  const clean = L.clean || ((s) => (s || "").trim());

  // /jobs/<id>-<slug> at the root, or nested under /company/<name>/jobs/<id>-<slug>.
  function jobKey() {
    const m = location.pathname.match(/\/jobs\/(\d+)-/);
    return m ? m[1] : null;
  }
  function onJobPage() { return /\/jobs\//.test(location.pathname) || !!jobKey(); }

  function scrape() {
    const ld = L.fromJsonLd ? L.fromJsonLd() : null;
    const id = jobKey();

    const title = (L.pick && L.pick(["h1"])) || clean(ld && ld.title);
    const companyEl = document.querySelector("a[href*='/company/']");
    const company = clean(companyEl && companyEl.textContent) || clean(ld && ld.hiringOrganization && ld.hiringOrganization.name);
    const companyUrl = companyEl && companyEl.href ? companyEl.href.split("?")[0] : (ld && ld.hiringOrganization && ld.hiringOrganization.sameAs) || "";

    const jobLocation = clean(ld && ld.jobLocation && ld.jobLocation.address && ld.jobLocation.address.addressLocality) ||
      (L.pick && L.pick(["[class*='location']"])) || "";
    const workplaceType = /remote/i.test((ld && ld.jobLocationType) || jobLocation) ? "Remote" : "";
    const salary = (L.salaryFromLd && L.salaryFromLd(ld)) || (L.pick && L.pick(["[class*='salary'], [class*='compensation']"])) || "";
    const employmentType = clean(ld && ld.employmentType) || "";

    const descEl = document.querySelector("[class*='job-description'], [class*='JobDescription']");
    const descriptionHtml = descEl ? descEl.innerHTML : clean(ld && ld.description);

    const postedAt = (L.toDate && L.toDate(ld && ld.datePosted)) || "";
    const deadline = (L.toDate && L.toDate(ld && ld.validThrough)) || "";

    if (!title && !company) return null;

    return {
      source: "wellfound",
      externalId: id,
      title, company, companyUrl,
      location: jobLocation,
      workplaceType,
      employmentType,
      applicants: "",
      salary,
      url: id ? `${location.origin}${location.pathname.split("?")[0]}` : location.href,
      applyUrl: "",
      postedText: "",
      postedAt, posted: postedAt,
      deadline,
      contactName: "", contactLinkedIn: "", contactTitle: "",
      descriptionHtml,
      scrapedFrom: location.href,
    };
  }

  window.__jobGrabSource = "wellfound";
  window.__jobGrabCurrentId = jobKey;
  window.__jobGrabOnJobPage = onJobPage;
  window.__jobGrabScrape = function () {
    try { return scrape(); } catch (e) {
      try { console.warn("[JobGrab] wellfound scrape error", e); } catch (_) {}
      return null;
    }
  };
})();
