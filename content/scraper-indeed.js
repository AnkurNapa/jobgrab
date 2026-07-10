// scraper-indeed.js - Indeed job extraction. JSON-LD JobPosting first (Indeed
// embeds it for SEO on most locales), DOM selectors as fallback. Indeed's job
// id is the "jk" query param (or "vjk" for the inline panel on a search page).

(function () {
  const L = window.__jobGrabLib || {};
  const clean = L.clean || ((s) => (s || "").trim());

  function jobKey() {
    let u; try { u = new URL(location.href); } catch (_) { return null; }
    return u.searchParams.get("vjk") || u.searchParams.get("jk") || null;
  }
  function onJobPage() { return /\/viewjob\b/.test(location.pathname) || !!jobKey(); }

  function scrape() {
    const ld = L.fromJsonLd ? L.fromJsonLd() : null;
    const id = jobKey();

    const title = (L.pick && L.pick(["h1.jobsearch-JobInfoHeader-title", "h1[data-testid='jobsearch-JobInfoHeader-title']", "h1"])) || clean(ld && ld.title);

    const companyEl = document.querySelector(
      "[data-testid='inlineHeader-companyName'] a, [data-testid='inlineHeader-companyName'], .jobsearch-CompanyInfoContainer a"
    );
    const company = clean(companyEl && companyEl.textContent) || clean(ld && ld.hiringOrganization && ld.hiringOrganization.name);
    const companyUrl = companyEl && companyEl.href ? companyEl.href.split("?")[0] : (ld && ld.hiringOrganization && ld.hiringOrganization.sameAs) || "";

    const jobLocation =
      (L.pick && L.pick(["[data-testid='inlineHeader-companyLocation']", "[data-testid='job-location']"])) ||
      clean(ld && ld.jobLocation && ld.jobLocation.address && ld.jobLocation.address.addressLocality);

    const salary =
      (L.pick && L.pick(["#salaryInfoAndJobType .css-1oc7tea", "[data-testid='attribute_snippet_compensation']", "[class*='salary']"])) ||
      (L.salaryFromLd && L.salaryFromLd(ld)) || "";

    const employmentType =
      (L.pick && L.pick(["[data-testid='attribute_snippet_testid']"])) || clean(ld && ld.employmentType) || "";

    const descEl = document.querySelector("#jobDescriptionText, .jobsearch-jobDescriptionText");
    const descriptionHtml = descEl ? descEl.innerHTML : clean(ld && ld.description);

    const postedAt = (L.toDate && L.toDate(ld && ld.datePosted)) || "";
    const deadline = (L.toDate && L.toDate(ld && ld.validThrough)) || "";

    if (!title && !company) return null;

    return {
      source: "indeed",
      externalId: id,
      title, company, companyUrl,
      location: jobLocation,
      workplaceType: /remote/i.test(jobLocation) ? "Remote" : "",
      employmentType,
      applicants: "",
      salary,
      url: id ? `${location.origin}/viewjob?jk=${id}` : location.href,
      applyUrl: "",
      postedText: "",
      postedAt, posted: postedAt,
      deadline,
      contactName: "", contactLinkedIn: "", contactTitle: "",
      descriptionHtml,
      scrapedFrom: location.href,
    };
  }

  window.__jobGrabSource = "indeed";
  window.__jobGrabCurrentId = jobKey;
  window.__jobGrabOnJobPage = onJobPage;
  window.__jobGrabScrape = function () {
    try { return scrape(); } catch (e) {
      try { console.warn("[JobGrab] indeed scrape error", e); } catch (_) {}
      return null;
    }
  };
})();
