// scraper.js - LinkedIn job extraction with layered fallbacks.
// Exposes window.__jobGrabScrape() returning a JobPosting-shaped object or null.
// Every selector is expected to break eventually, so we try several strategies
// in priority order and never throw.

(function () {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  function getJobId() {
    let u;
    try { u = new URL(location.href); } catch (_) { return null; }
    const p = u.searchParams.get("currentJobId");
    if (p && /^\d+$/.test(p)) return p;
    const m = location.pathname.match(/\/jobs\/view\/(\d+)/);
    if (m) return m[1];
    // Scope the DOM fallback to the open job's own detail pane. An unscoped
    // document-wide query returns the first DOM match, which on a search or
    // collections panel is a card in the results list -- not whichever job
    // is actually open -- so every save would silently collapse onto that
    // one list item's id instead of the job you meant to capture.
    const detailRoot = document.querySelector(
      "#job-details, .job-details-jobs-unified-top-card__container, .jobs-details__main-content"
    ) || document.querySelector(
      ".job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title"
    );
    const scope = (detailRoot && detailRoot.closest("[data-job-id], [data-entity-urn*='jobPosting']")) || detailRoot;
    if (scope && scope.getAttribute) {
      const raw = scope.getAttribute("data-job-id") || scope.getAttribute("data-entity-urn") || "";
      const mm = raw.match(/(\d{6,})/);
      if (mm) return mm[1];
    }
    // Last resort: the canonical /jobs/view/<id> link inside the detail pane.
    const link = (detailRoot || document).querySelector("a[href*='/jobs/view/']");
    if (link) {
      const lm = link.href.match(/\/jobs\/view\/(\d+)/);
      if (lm) return lm[1];
    }
    return null;
  }

  function fromJsonLd() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        const nodes = Array.isArray(data) ? data : [data];
        for (const n of nodes) if (n && n["@type"] === "JobPosting") return n;
      } catch (_) {}
    }
    return null;
  }

  function pick(selectors, root = document) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el && clean(el.textContent)) return clean(el.textContent);
    }
    return "";
  }
  function pickAttr(selectors, attr, root = document) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el && el.getAttribute(attr)) return el.getAttribute(attr);
    }
    return "";
  }

  // Normalize a date to YYYY-MM-DD, or "" if unparseable.
  function toDate(v) {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  }

  // Insight pills carry workplace type, employment type, applicants, sometimes salary.
  function insights() {
    const nodes = document.querySelectorAll(
      ".job-details-jobs-unified-top-card__job-insight, .job-details-preferences-and-skills__pill, .jobs-unified-top-card__job-insight"
    );
    return Array.from(nodes).map((n) => clean(n.textContent)).filter(Boolean);
  }

  // The "Meet the hiring team" card: contact name + profile link.
  function contact() {
    const card = document.querySelector(
      ".hirer-card__hirer-information, .job-details-people-who-can-help__section, .jobs-poster__container"
    );
    let name = "", url = "", title = "";
    const link = (card || document).querySelector(
      ".hirer-card__hirer-information a[href*='/in/'], a.app-aware-link[href*='/in/']"
    );
    if (link) {
      url = link.href.split("?")[0];
      name = clean(link.textContent);
    }
    if (card) {
      title = pick([".hirer-card__hirer-job-title", ".jobs-poster__headline"], card);
    }
    return { name, url, title };
  }

  function scrape() {
    const pageUrl = window.location.href;
    const jobId = getJobId();
    const ld = fromJsonLd();
    const pills = insights();

    const title =
      pick([
        ".job-details-jobs-unified-top-card__job-title",
        ".job-details-jobs-unified-top-card__job-title h1",
        ".jobs-unified-top-card__job-title",
        ".top-card-layout__title",
        "h1",
      ]) || clean(ld && ld.title);

    const companyEl = document.querySelector(
      ".job-details-jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name a, .topcard__org-name-link"
    );
    const company =
      pick([
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name a",
        ".topcard__org-name-link",
        ".top-card-layout__second-subline a",
      ]) || clean(ld && ld.hiringOrganization && ld.hiringOrganization.name);
    const companyUrl = companyEl ? companyEl.href.split("?")[0] : (ld && ld.hiringOrganization && ld.hiringOrganization.sameAs) || "";

    const metaBlob = pick([
      ".job-details-jobs-unified-top-card__primary-description-container",
      ".job-details-jobs-unified-top-card__tertiary-description-container",
      ".jobs-unified-top-card__primary-description",
      ".topcard__flavor-row",
    ]);
    const jobLocation =
      clean(ld && ld.jobLocation && ld.jobLocation.address && ld.jobLocation.address.addressLocality) ||
      clean(metaBlob.split("·")[0]);

    const workplaceType =
      pills.find((p) => /\b(remote|hybrid|on-?site)\b/i.test(p)) || "";
    const employmentType =
      pills.find((p) => /\b(full-?time|part-?time|contract|temporary|internship|freelance)\b/i.test(p)) ||
      clean(ld && ld.employmentType) || "";
    const applicants = pills.find((p) => /applicant/i.test(p)) || "";

    let salary =
      pick([
        ".jobs-details__salary-main-rail-card",
        ".job-details-jobs-unified-top-card__job-insight span",
        "[class*='salary']",
      ]);
    if (!/\$|€|£|₹|\d[.,]\d/.test(salary)) {
      salary = pills.find((p) => /\$|€|£|₹|\/yr|\/hr|per year|per hour|k\b/i.test(p)) || "";
    }
    if (!salary && ld && ld.baseSalary && ld.baseSalary.value) {
      const v = ld.baseSalary.value;
      salary = `${v.minValue || ""}-${v.maxValue || ""} ${ld.baseSalary.currency || ""}`.trim();
    }

    const postedText = pick([
      ".jobs-unified-top-card__posted-date",
      ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
      "time",
    ]);
    const postedAt = toDate(ld && ld.datePosted) || pickAttr(["time"], "datetime");
    const deadline = toDate(ld && ld.validThrough); // LinkedIn rarely shows a UI deadline

    // External apply link when present (Easy Apply has no href we can read).
    const applyUrl = pickAttr(
      ["a.jobs-apply-button[href]", ".jobs-apply-button--top-card a[href]", "a[data-tracking-control-name*='apply']"],
      "href"
    );

    const descEl = document.querySelector(
      "#job-details, .jobs-description__content, .jobs-description-content__text, .show-more-less-html__markup"
    );
    const descriptionHtml = descEl ? descEl.innerHTML : clean(ld && ld.description);

    const c = contact();

    if (!title && !company) return null;

    return {
      source: "linkedin",
      externalId: jobId,
      title,
      company,
      companyUrl,
      location: jobLocation,
      workplaceType,
      employmentType,
      applicants,
      salary: /\$|€|£|₹|\d[.,]\d|k\b/i.test(salary) ? salary : "",
      url: jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : pageUrl,
      applyUrl: applyUrl || "",
      postedText,
      postedAt,
      posted: postedAt, // editable Posted date field in the tracker
      deadline,
      contactName: c.name,
      contactLinkedIn: c.url,
      contactTitle: c.title,
      descriptionHtml,
      scrapedFrom: pageUrl,
    };
  }

  window.__jobGrabScrape = function () {
    try { return scrape(); } catch (e) {
      try { console.warn("[JobGrab] scrape error", e); } catch (_) {}
      return null;
    }
  };
})();
