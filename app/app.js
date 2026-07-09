import { getJobs, updateJob, deleteJob, saveJob, STATUSES } from "../lib/store.js";
import { toISO, fmt, daysUntil } from "../lib/dates.js";
import { svg, iconEl } from "../lib/icons.js";

const $ = (id) => document.getElementById(id);
let allJobs = [];
let activeId = null;
let activeTab = "info";
let view = "jobs"; // jobs | detail | people | companies
let statusFilter = null;
let sortKey = "savedAt";
let sortDir = -1; // -1 desc, 1 asc

// ---------- helpers ----------
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
function htmlToText(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}
// Date helpers live in lib/dates.js (single source). Local aliases keep call sites terse.
const fmtDate = fmt;
const isoDate = toISO;
function starsInline(job, onPick) {
  const wrap = el("span", "row-stars");
  const rating = Number(job.excitement) || 0;
  for (let i = 1; i <= 5; i++) {
    const s = el("span", "star" + (i <= rating ? " on" : ""), "★");
    s.addEventListener("click", (e) => { e.stopPropagation(); onPick(i === rating ? 0 : i); });
    wrap.appendChild(s);
  }
  return wrap;
}

// ---------- view switching ----------
function setView(v) {
  view = v;
  $("table-view").hidden = v !== "jobs";
  $("detail-view").hidden = v !== "detail";
  $("stub-view").hidden = !(v === "people" || v === "companies" || v === "skills");
  $("pipeline").style.display = v === "jobs" ? "" : "none";
  document.querySelector(".toolbar").style.display = v === "jobs" ? "" : "none";
  document.querySelectorAll(".nav__tab").forEach((t) =>
    t.classList.toggle("is-active", t.dataset.view === (v === "detail" ? "jobs" : v)));
  if (v === "people") renderPeople();
  if (v === "companies") renderCompanies();
  if (v === "skills") renderSkills();
}

// ---------- People roll-up (unique contacts across saved jobs) ----------
function renderPeople() {
  const host = $("stub-view");
  host.textContent = "";
  host.append(el("h2", null, "People"));
  const map = new Map();
  allJobs.forEach((j) => {
    const name = (j.contactName || "").trim();
    if (!name && !j.contactLinkedIn) return;
    const key = (j.contactLinkedIn || name).toLowerCase();
    if (!map.has(key)) map.set(key, { name: name || "(unnamed)", title: j.contactTitle || "", url: j.contactLinkedIn || "", jobs: [] });
    map.get(key).jobs.push(j);
  });
  const people = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (!people.length) { host.append(el("p", "empty", "No contacts yet. Add a contact person and their LinkedIn on a job's Contacts tab and they will appear here.")); return; }

  const table = el("table", "jt");
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  ["Contact", "Title", "Related jobs", "LinkedIn"].forEach((h) => htr.appendChild(el("th", "", h)));
  thead.appendChild(htr); table.appendChild(thead);
  const tb = document.createElement("tbody");
  people.forEach((p) => {
    const tr = document.createElement("tr");
    tr.appendChild(el("td", "c-title", p.name));
    tr.appendChild(el("td", p.title ? "" : "c-muted", p.title || "—"));
    const jt = document.createElement("td");
    p.jobs.forEach((j, i) => {
      const a = el("a", null, j.title || "(untitled)");
      a.href = "#"; a.style.color = "var(--teal)"; a.style.cursor = "pointer";
      a.addEventListener("click", (e) => { e.preventDefault(); openDetail(j.id); });
      jt.appendChild(a);
      if (i < p.jobs.length - 1) jt.appendChild(document.createTextNode(", "));
    });
    tr.appendChild(jt);
    const lk = document.createElement("td");
    if (p.url) { const a = el("a", null, "Profile"); a.href = p.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.style.color = "var(--teal)"; lk.appendChild(a); }
    else lk.appendChild(el("span", "na", "—"));
    tr.appendChild(lk);
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  const card = el("div", "tablecard"); card.appendChild(table);
  const wrap = el("div", "tablewrap"); wrap.appendChild(card); host.appendChild(wrap);
}

// ---------- Companies roll-up ----------
function renderCompanies() {
  const host = $("stub-view");
  host.textContent = "";
  host.append(el("h2", null, "Companies"));
  const map = new Map();
  allJobs.forEach((j) => {
    const name = (j.company || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, { name, url: j.companyUrl || "", jobs: [] });
    map.get(key).jobs.push(j);
    if (!map.get(key).url && j.companyUrl) map.get(key).url = j.companyUrl;
  });
  const companies = [...map.values()].sort((a, b) => b.jobs.length - a.jobs.length || a.name.localeCompare(b.name));
  if (!companies.length) { host.append(el("p", "empty", "No companies yet. Saved jobs will roll up by company here.")); return; }

  const table = el("table", "jt");
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  ["Company", "Jobs", "Statuses", "Page"].forEach((h) => htr.appendChild(el("th", "", h)));
  thead.appendChild(htr); table.appendChild(thead);
  const tb = document.createElement("tbody");
  companies.forEach((c) => {
    const tr = document.createElement("tr");
    tr.appendChild(el("td", "c-title", c.name));
    const jt = document.createElement("td");
    c.jobs.forEach((j, i) => {
      const a = el("a", null, j.title || "(untitled)");
      a.href = "#"; a.style.color = "var(--teal)"; a.style.cursor = "pointer";
      a.addEventListener("click", (e) => { e.preventDefault(); openDetail(j.id); });
      jt.appendChild(a);
      if (i < c.jobs.length - 1) jt.appendChild(document.createTextNode(", "));
    });
    tr.appendChild(jt);
    const statuses = [...new Set(c.jobs.map((j) => j.status).filter(Boolean))];
    const stTd = document.createElement("td");
    statuses.forEach((s) => { const p = el("span", "status-pill", s); p.dataset.status = s; stTd.appendChild(p); });
    tr.appendChild(stTd);
    const lk = document.createElement("td");
    if (c.url) { const a = el("a", null, "Open"); a.href = c.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.style.color = "var(--teal)"; lk.appendChild(a); }
    else lk.appendChild(el("span", "na", "—"));
    tr.appendChild(lk);
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  const card = el("div", "tablecard"); card.appendChild(table);
  const wrap = el("div", "tablewrap"); wrap.appendChild(card); host.appendChild(wrap);
}

// ---------- Skills roll-up (spider chart of top skills by job title) ----------
// A fixed keyword dictionary matched against job titles -- titles are always
// captured (unlike descriptions, which aren't every time), so this is the
// most reliable signal available without asking the user to tag skills by hand.
const SKILL_KEYWORDS = [
  "Python", "SQL", "Excel", "Power BI", "Tableau", "Machine Learning", "AI",
  "Data Analysis", "Data Science", "Data Engineering", "Statistics", "R",
  "JavaScript", "TypeScript", "React", "Node.js", "Java", "C++", "Go", "Ruby",
  "AWS", "Azure", "GCP", "Cloud", "DevOps", "Docker", "Kubernetes",
  "Product Management", "Project Management", "Program Management",
  "Leadership", "Strategy", "Analyst", "Analytics", "Marketing", "Sales",
  "SEO", "Content", "UX", "UI", "Design", "Figma", "Salesforce", "CRM",
  "Finance", "Accounting", "HR", "Recruiting", "Customer Service",
  "Operations", "Supply Chain", "Logistics", "Manufacturing", "QA",
  "Security", "Networking", "Linux", "Git", "API", "ETL", "Big Data",
  "NLP", "Deep Learning", "TensorFlow", "PyTorch", "Research", "Consulting",
];
// One representative emoji per skill/industry so the ranked list and radar
// chart read faster than plain text alone -- purely decorative, keyed to
// the same SKILL_KEYWORDS strings above.
const SKILL_ICONS = {
  Python: "🐍", SQL: "🗄️", Excel: "📈", "Power BI": "📊", Tableau: "📊",
  "Machine Learning": "🤖", AI: "🤖", "Data Analysis": "📊", "Data Science": "🔬",
  "Data Engineering": "🛠️", Statistics: "📐", R: "📉", JavaScript: "🟨",
  TypeScript: "🔷", React: "⚛️", "Node.js": "🟢", Java: "☕", "C++": "➕",
  Go: "🐹", Ruby: "💎", AWS: "☁️", Azure: "☁️", GCP: "☁️", Cloud: "☁️",
  DevOps: "🔧", Docker: "🐳", Kubernetes: "☸️", "Product Management": "📦",
  "Project Management": "📋", "Program Management": "📋", Leadership: "🧭",
  Strategy: "♟️", Analyst: "🔍", Analytics: "📊", Marketing: "📣", Sales: "💼",
  SEO: "🔎", Content: "✍️", UX: "🎨", UI: "🎨", Design: "🎨", Figma: "🎨",
  Salesforce: "☁️", CRM: "📇", Finance: "💰", Accounting: "🧾", HR: "🧑‍💼",
  Recruiting: "🧑‍💼", "Customer Service": "🎧", Operations: "⚙️",
  "Supply Chain": "🚚", Logistics: "🚚", Manufacturing: "🏭", QA: "✅",
  Security: "🔒", Networking: "🌐", Linux: "🐧", Git: "🔧", API: "🔌",
  ETL: "🔄", "Big Data": "🗃️", NLP: "💬", "Deep Learning": "🧠",
  TensorFlow: "🧠", PyTorch: "🧠", Research: "🔬", Consulting: "🧭",
};
function skillPattern(kw) {
  // \b word-boundary matching keeps short keywords (R, AI, QA, UX...) from
  // matching as substrings inside unrelated words.
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`, "i");
}
function extractSkills(title) {
  const t = title || "";
  return SKILL_KEYWORDS.filter((kw) => skillPattern(kw).test(t));
}

function renderSkills() {
  const host = $("stub-view");
  host.textContent = "";
  host.append(el("h2", null, "Skills"));

  const counts = new Map();
  allJobs.forEach((j) => {
    extractSkills(j.title).forEach((s) => counts.set(s, (counts.get(s) || 0) + 1));
  });
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (!ranked.length) {
    host.append(el("p", "empty",
      "No recognizable skills yet. Skills are detected from job titles (e.g. \"Python\", \"Product Management\", \"AWS\") -- save a few more jobs and they will show up here."));
    return;
  }

  const top = ranked.slice(0, 8);
  const [topSkill, topCount] = top[0];
  const totalJobs = allJobs.length;

  const callout = el("div", "skills-callout");
  callout.append(
    el("span", "skills-callout__label", "Top skill"),
    el("span", "skills-callout__value", `${SKILL_ICONS[topSkill] || ""} ${topSkill}`),
    el("span", "skills-callout__meta", `in ${topCount} of ${totalJobs} saved job${totalJobs === 1 ? "" : "s"}`)
  );
  host.appendChild(callout);

  // Dashboard row: radar chart, word cloud, status donut, top companies, locations.
  const dash = el("div", "skills-dash");
  dash.appendChild(radarChart(top.map(([skill, count]) => [`${SKILL_ICONS[skill] || ""} ${skill}`, count])));
  dash.appendChild(wordCloud(allJobs));
  dash.appendChild(statusDonut(allJobs));
  dash.appendChild(companyBarChart(allJobs));
  dash.appendChild(locationBarChart(allJobs));
  dash.appendChild(roleLevelChart(allJobs));
  host.appendChild(dash);

  // Full ranked list below the dashboard row -- the chart caps at 8 axes
  // for readability, but every detected skill still gets counted here.
  const list = el("ul", "skills-list");
  ranked.forEach(([skill, count]) => {
    const li = document.createElement("li");
    li.appendChild(el("span", "skills-list__name", `${SKILL_ICONS[skill] || ""} ${skill}`));
    const bar = el("div", "skills-list__bar");
    const fill = el("div", "skills-list__fill");
    fill.style.width = `${Math.round((count / topCount) * 100)}%`;
    bar.appendChild(fill);
    li.appendChild(bar);
    li.appendChild(el("span", "skills-list__count", String(count)));
    list.appendChild(li);
  });
  host.appendChild(list);
}

// Word cloud of common terms across saved job descriptions -- a broader,
// unfiltered complement to the fixed skills dictionary above: this surfaces
// whatever language actually shows up in the JDs (tools, domains, phrases
// the keyword list doesn't know about), not just the recognized skill set.
const STOPWORDS = new Set((
  "a an the and or but if of to in on for with at by from as is are was were " +
  "be been being have has had do does did will would could should may might " +
  "must can this that these those it its we you your our their his her they " +
  "not no yes than then so such into about over under between out up down " +
  "job role team work experience years year including etc using also all any " +
  "more most other some what which who whom where when why how per each " +
  "both few both same such only own same skills responsibilities requirements " +
  "we're you'll we'll re ll ve don't we've apply looking join across within"
).split(/\s+/));

function wordFrequencies(jobs) {
  const counts = new Map();
  jobs.forEach((j) => {
    const text = `${j.title || ""} ${htmlToText(j.descriptionHtml)}`.toLowerCase();
    const words = text.match(/[a-z][a-z+#.-]{2,}/g) || [];
    words.forEach((w) => {
      const clean = w.replace(/^[-.]+|[-.]+$/g, "");
      if (clean.length < 3 || STOPWORDS.has(clean)) return;
      counts.set(clean, (counts.get(clean) || 0) + 1);
    });
  });
  return counts;
}

function wordCloud(jobs) {
  const withDesc = jobs.filter((j) => j.descriptionHtml);
  const counts = wordFrequencies(jobs);
  const ranked = [...counts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, 40);

  const section = el("div", "word-cloud-section");
  section.appendChild(el("h3", "sect", "Word cloud from job descriptions"));

  if (!withDesc.length) {
    section.appendChild(el("p", "empty",
      "No job descriptions captured yet. The word cloud reads from each job's full description snapshot, which LinkedIn only exposes when you save from an open job page (not a search list) -- save a few that way and this fills in."));
    return section;
  }
  if (!ranked.length) {
    section.appendChild(el("p", "empty", "Not enough repeated terms yet across your saved descriptions."));
    return section;
  }

  const max = ranked[0][1];
  const min = ranked[ranked.length - 1][1];
  const cloud = el("div", "word-cloud");
  // A varied, on-brand palette (not just teal) so the cloud reads as
  // colorful rather than a monochrome size-only list. Colors cycle by
  // index, independent of frequency, purely for visual variety.
  const PALETTE = ["var(--teal)", "var(--teal-strong)", "var(--teal-bright)", "var(--amber)", "var(--success)", "var(--ink)"];
  // Shuffle for a natural cloud layout (not a strict frequency list top to
  // bottom) while font-size still encodes the actual rank.
  const shuffled = [...ranked].sort(() => Math.random() - 0.5);
  shuffled.forEach(([word, count], i) => {
    const t = max === min ? 1 : (count - min) / (max - min);
    const span = el("span", "word-cloud__word", word);
    span.style.fontSize = `${13 + t * 21}px`;
    span.style.color = PALETTE[i % PALETTE.length];
    span.title = `${count} mentions`;
    cloud.appendChild(span);
  });
  section.appendChild(cloud);
  return section;
}

// Same status -> color mapping as the CSS status-pill/pipe__step rules,
// expressed as CSS var() references so this SVG stays in sync with theme
// (light/dark) automatically without duplicating actual color values.
const STATUS_CHART_COLOR = {
  bookmarked: "var(--faint)", applying: "var(--amber)", applied: "var(--teal-bright)",
  interviewing: "var(--teal)", negotiating: "var(--teal-strong)", accepted: "var(--success)",
  rejected: "var(--danger)", ghosted: "var(--muted)",
};

function statusDonut(jobs) {
  const section = el("div", "chart-card");
  section.appendChild(el("h3", "sect", "Status distribution"));

  const counts = new Map();
  jobs.forEach((j) => { const s = j.status || "bookmarked"; counts.set(s, (counts.get(s) || 0) + 1); });
  const entries = STATUSES.filter((s) => counts.has(s)).map((s) => [s, counts.get(s)]);

  if (!entries.length) { section.appendChild(el("p", "empty", "No jobs yet.")); return section; }

  const size = 200, cx = size / 2, cy = size / 2, rOuter = 90, rInner = 56;
  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  const svgNs = "http://www.w3.org/2000/svg";
  const svgEl = document.createElementNS(svgNs, "svg");
  svgEl.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svgEl.setAttribute("width", String(size));
  svgEl.setAttribute("height", String(size));

  const arcPath = (startFrac, endFrac) => {
    const a0 = startFrac * Math.PI * 2 - Math.PI / 2;
    const a1 = endFrac * Math.PI * 2 - Math.PI / 2;
    const large = endFrac - startFrac > 0.5 ? 1 : 0;
    const p = (r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const [ox0, oy0] = p(rOuter, a0), [ox1, oy1] = p(rOuter, a1);
    const [ix1, iy1] = p(rInner, a1), [ix0, iy0] = p(rInner, a0);
    return `M ${ox0} ${oy0} A ${rOuter} ${rOuter} 0 ${large} 1 ${ox1} ${oy1} ` +
      `L ${ix1} ${iy1} A ${rInner} ${rInner} 0 ${large} 0 ${ix0} ${iy0} Z`;
  };

  let acc = 0;
  entries.forEach(([status, count]) => {
    const start = acc / total, end = (acc + count) / total;
    acc += count;
    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("d", entries.length === 1 ? "" : arcPath(start, end));
    if (entries.length === 1) {
      const c = document.createElementNS(svgNs, "circle");
      c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", (rOuter + rInner) / 2);
      c.setAttribute("fill", "none");
      c.setAttribute("stroke", STATUS_CHART_COLOR[status] || "var(--teal)");
      c.setAttribute("stroke-width", rOuter - rInner);
      svgEl.appendChild(c);
    } else {
      path.setAttribute("fill", STATUS_CHART_COLOR[status] || "var(--teal)");
      path.setAttribute("class", "donut-slice");
      const title = document.createElementNS(svgNs, "title");
      title.textContent = `${status}: ${count}`;
      path.appendChild(title);
      svgEl.appendChild(path);
    }
  });

  const centerLabel = document.createElementNS(svgNs, "text");
  centerLabel.setAttribute("x", cx); centerLabel.setAttribute("y", cy - 4);
  centerLabel.setAttribute("text-anchor", "middle"); centerLabel.setAttribute("class", "donut-center-count");
  centerLabel.textContent = String(total);
  svgEl.appendChild(centerLabel);
  const centerSub = document.createElementNS(svgNs, "text");
  centerSub.setAttribute("x", cx); centerSub.setAttribute("y", cy + 14);
  centerSub.setAttribute("text-anchor", "middle"); centerSub.setAttribute("class", "donut-center-sub");
  centerSub.textContent = total === 1 ? "job" : "jobs";
  svgEl.appendChild(centerSub);

  const wrap = el("div", "donut-wrap");
  wrap.appendChild(svgEl);
  const legend = el("div", "donut-legend");
  entries.forEach(([status, count]) => {
    const item = el("span", "donut-legend__item");
    const dot = el("span", "donut-legend__dot");
    dot.style.background = STATUS_CHART_COLOR[status] || "var(--teal)";
    item.append(dot, el("span", null, `${status} (${count})`));
    legend.appendChild(item);
  });
  wrap.appendChild(legend);
  section.appendChild(wrap);
  return section;
}

function companyBarChart(jobs) {
  const section = el("div", "chart-card");
  section.appendChild(el("h3", "sect", "Top companies"));

  const counts = new Map();
  jobs.forEach((j) => {
    const name = (j.company || "").trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  });
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);

  if (!ranked.length) { section.appendChild(el("p", "empty", "No companies yet.")); return section; }

  const max = ranked[0][1];
  const list = el("div", "company-bars");
  ranked.forEach(([name, count]) => {
    const row = el("div", "company-bars__row");
    row.appendChild(el("span", "company-bars__name", name));
    const track = el("div", "company-bars__track");
    const fill = el("div", "company-bars__fill");
    fill.style.width = `${Math.round((count / max) * 100)}%`;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el("span", "company-bars__count", String(count)));
    list.appendChild(row);
  });
  section.appendChild(list);
  return section;
}

// Country flags matched against job.location by keyword -- location is
// free text ("Bengaluru, India", "EMEA", "Remote"), not a structured
// country code, so this is a best-effort keyword match, not geo-parsing.
// Anything that doesn't match a known country (regions like EMEA/APAC,
// or "Remote") buckets into "Other / Remote" with a globe, transparently
// rather than guessing wrong.
const COUNTRY_FLAGS = [
  ["india", "🇮🇳 India"], ["united states", "🇺🇸 United States"], ["usa", "🇺🇸 United States"],
  ["united kingdom", "🇬🇧 United Kingdom"], [" uk", "🇬🇧 United Kingdom"], ["australia", "🇦🇺 Australia"],
  ["canada", "🇨🇦 Canada"], ["germany", "🇩🇪 Germany"], ["singapore", "🇸🇬 Singapore"],
  ["united arab emirates", "🇦🇪 UAE"], ["uae", "🇦🇪 UAE"], ["ireland", "🇮🇪 Ireland"],
  ["netherlands", "🇳🇱 Netherlands"], ["france", "🇫🇷 France"], ["brazil", "🇧🇷 Brazil"],
  ["japan", "🇯🇵 Japan"], ["china", "🇨🇳 China"], ["new zealand", "🇳🇿 New Zealand"],
  ["philippines", "🇵🇭 Philippines"], ["vietnam", "🇻🇳 Vietnam"], ["spain", "🇪🇸 Spain"],
  ["italy", "🇮🇹 Italy"], ["sweden", "🇸🇪 Sweden"], ["switzerland", "🇨🇭 Switzerland"],
  ["mexico", "🇲🇽 Mexico"], ["south africa", "🇿🇦 South Africa"], ["nigeria", "🇳🇬 Nigeria"],
  ["kenya", "🇰🇪 Kenya"], ["israel", "🇮🇱 Israel"], ["poland", "🇵🇱 Poland"],
  ["portugal", "🇵🇹 Portugal"], ["indonesia", "🇮🇩 Indonesia"], ["malaysia", "🇲🇾 Malaysia"],
  ["thailand", "🇹🇭 Thailand"], ["korea", "🇰🇷 South Korea"],
];
function flagForLocation(location) {
  const loc = ` ${(location || "").toLowerCase()} `;
  const hit = COUNTRY_FLAGS.find(([kw]) => loc.includes(kw));
  return hit ? hit[1] : "🌐 Other / Remote";
}

function locationBarChart(jobs) {
  const section = el("div", "chart-card");
  section.appendChild(el("h3", "sect", "Top locations"));

  const counts = new Map();
  jobs.forEach((j) => {
    if (!j.location) return;
    const flagged = flagForLocation(j.location);
    counts.set(flagged, (counts.get(flagged) || 0) + 1);
  });
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);

  if (!ranked.length) { section.appendChild(el("p", "empty", "No locations captured yet.")); return section; }

  const max = ranked[0][1];
  const list = el("div", "company-bars");
  ranked.forEach(([name, count]) => {
    const row = el("div", "company-bars__row");
    row.appendChild(el("span", "company-bars__name", name));
    const track = el("div", "company-bars__track");
    const fill = el("div", "company-bars__fill");
    fill.style.width = `${Math.round((count / max) * 100)}%`;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el("span", "company-bars__count", String(count)));
    list.appendChild(row);
  });
  section.appendChild(list);
  return section;
}

// Manager/Lead vs Individual Contributor -- a best-effort heuristic from
// title keywords, not a guarantee (a "Lead Engineer" can be either in
// practice). Documented as approximate rather than presented as fact.
const MANAGER_KEYWORDS = /\b(manager|director|head of|head,|vp|vice president|chief|president|principal|executive)\b/i;
function classifyRoleLevel(title) {
  return MANAGER_KEYWORDS.test(title || "") ? "Manager / Lead" : "Individual Contributor";
}

function roleLevelChart(jobs) {
  const section = el("div", "chart-card");
  section.appendChild(el("h3", "sect", "Manager vs. IC"));

  if (!jobs.length) { section.appendChild(el("p", "empty", "No jobs yet.")); return section; }

  const counts = { "Manager / Lead": 0, "Individual Contributor": 0 };
  jobs.forEach((j) => { counts[classifyRoleLevel(j.title)]++; });
  const total = jobs.length;

  const wrap = el("div", "role-split");
  [["Manager / Lead", "role-split__bar--manager"], ["Individual Contributor", "role-split__bar--ic"]].forEach(([label, cls]) => {
    const count = counts[label];
    const pct = total ? Math.round((count / total) * 100) : 0;
    const row = el("div", "role-split__row");
    row.appendChild(el("span", "role-split__label", label));
    const track = el("div", "role-split__track");
    const fill = el("div", `role-split__fill ${cls}`);
    fill.style.width = `${pct}%`;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el("span", "role-split__pct", `${pct}%`));
    wrap.appendChild(row);
  });
  section.appendChild(wrap);
  section.appendChild(el("p", "chart-card__note",
    "Best-effort guess from title keywords (Manager, Director, Head of, VP...) -- not exact."));
  return section;
}

// Hand-rolled SVG radar/spider chart -- no charting dependency, styled
// entirely from the app's existing CSS custom properties so it matches
// light/dark theme automatically.
function radarChart(entries) {
  // Wider-than-tall viewBox: labels overflow mostly left/right (long skill
  // names anchored start/end at the horizontal extremes), not up/down, so
  // the circle itself stays centered while the sides get extra breathing
  // room instead of clipping a wrapped two-line label like "Machine Learning".
  const w = 420, h = 380, cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 78;
  const n = entries.length;
  const max = Math.max(...entries.map(([, c]) => c), 1);
  const angleFor = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointFor = (i, frac) => {
    const a = angleFor(i);
    return [cx + Math.cos(a) * r * frac, cy + Math.sin(a) * r * frac];
  };

  const svgNs = "http://www.w3.org/2000/svg";
  const svgEl = document.createElementNS(svgNs, "svg");
  svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svgEl.setAttribute("width", String(w));
  svgEl.setAttribute("height", String(h));
  svgEl.classList.add("radar-chart");

  const mk = (tag, attrs) => {
    const node = document.createElementNS(svgNs, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };

  // Grid rings at 25/50/75/100%.
  [0.25, 0.5, 0.75, 1].forEach((frac) => {
    const pts = entries.map((_, i) => pointFor(i, frac).join(",")).join(" ");
    svgEl.appendChild(mk("polygon", { points: pts, class: "radar-chart__ring" }));
  });

  // Spokes + axis labels. Long labels wrap onto a second tspan line instead
  // of running off the edge of the viewBox (e.g. "Machine Learning" was
  // getting clipped to "...irning" on the left side before this).
  entries.forEach(([skill], i) => {
    const [x, y] = pointFor(i, 1);
    svgEl.appendChild(mk("line", { x1: cx, y1: cy, x2: x, y2: y, class: "radar-chart__spoke" }));
    const [lx, ly] = pointFor(i, 1.3);
    const anchor = lx > cx + 4 ? "start" : lx < cx - 4 ? "end" : "middle";
    const label = mk("text", { x: lx, y: ly, class: "radar-chart__label", "text-anchor": anchor });
    const words = skill.split(" ");
    const lines = words.length > 1 && skill.length > 10
      ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")]
      : [skill];
    const startDy = ly < cy - 4 ? -(lines.length - 1) * 12 : ly > cy + 4 ? 0 : -((lines.length - 1) * 12) / 2;
    lines.forEach((line, li) => {
      const tspan = mk("tspan", { x: lx, dy: li === 0 ? startDy : 12 });
      tspan.textContent = line;
      label.appendChild(tspan);
    });
    svgEl.appendChild(label);
  });

  // Data polygon.
  const dataPts = entries.map(([, count], i) => pointFor(i, count / max).join(",")).join(" ");
  svgEl.appendChild(mk("polygon", { points: dataPts, class: "radar-chart__data" }));
  entries.forEach(([, count], i) => {
    const [x, y] = pointFor(i, count / max);
    svgEl.appendChild(mk("circle", { cx: x, cy: y, r: 3.5, class: "radar-chart__dot" }));
  });

  const wrap = el("div", "radar-chart__wrap");
  wrap.appendChild(svgEl);
  return wrap;
}

// ---------- pipeline summary ----------
function renderPipeline() {
  const pipe = $("pipeline");
  pipe.textContent = "";
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  allJobs.forEach((j) => { if (counts[j.status] != null) counts[j.status]++; });
  STATUSES.filter((s) => s !== "rejected" && s !== "ghosted").forEach((s) => {
    const step = el("div", "pipe__step" + (statusFilter === s ? " is-active" : ""));
    step.dataset.status = s;
    const c = counts[s] || 0;
    step.append(el("div", "pipe__count" + (c ? "" : " zero"), c ? String(c) : "--"),
      el("span", "pipe__label", s));
    step.addEventListener("click", () => { statusFilter = statusFilter === s ? null : s; renderPipeline(); renderTable(); });
    pipe.appendChild(step);
  });
}

// ---------- table ----------
const COLUMNS = [
  { key: "title", label: "Job Position", cls: "c-title" },
  { key: "company", label: "Company" },
  { key: "salary", label: "Max. Salary" },
  { key: "location", label: "Location" },
  { key: "status", label: "Status" },
  { key: "savedAt", label: "Date Saved" },
  { key: "deadline", label: "Deadline" },
  { key: "appliedAt", label: "Date Applied" },
  { key: "followUpAt", label: "Follow up" },
  { key: "excitement", label: "Excitement" },
];

function renderTable() {
  const head = $("jt-head");
  head.textContent = "";
  COLUMNS.forEach((c) => {
    const th = el("th", sortKey === c.key ? "sorted" : "");
    th.append(document.createTextNode(c.label));
    const arrow = el("span", "arrow ic");
    arrow.innerHTML = svg(sortKey === c.key ? (sortDir === 1 ? "sortUp" : "sortDown") : "sortNone", 14);
    th.appendChild(arrow);
    th.addEventListener("click", () => {
      if (sortKey === c.key) sortDir *= -1; else { sortKey = c.key; sortDir = 1; }
      renderTable();
    });
    head.appendChild(th);
  });

  const q = $("search").value.trim().toLowerCase();
  let rows = allJobs
    .filter((j) => !statusFilter || j.status === statusFilter)
    .filter((j) => !q || (j.title + " " + j.company).toLowerCase().includes(q));

  rows.sort((a, b) => {
    let x = a[sortKey], y = b[sortKey];
    if (sortKey === "savedAt") { x = a.savedAt || 0; y = b.savedAt || 0; }
    x = x == null ? "" : x; y = y == null ? "" : y;
    if (typeof x === "string") x = x.toLowerCase();
    if (typeof y === "string") y = y.toLowerCase();
    return x < y ? -1 * sortDir : x > y ? 1 * sortDir : 0;
  });

  const body = $("jt-body");
  body.textContent = "";
  $("count").textContent = `${rows.length} job${rows.length === 1 ? "" : "s"}` + (statusFilter ? ` · ${statusFilter}` : "");
  $("table-empty").hidden = allJobs.length > 0;

  rows.forEach((job) => {
    // A single malformed record must never blank out every other row: if
    // building this <tr> throws partway through, the row was never
    // appended and the count (already set above) silently stopped
    // matching what's on screen, with no error visible anywhere. Catch
    // per-row so one bad job degrades to a "row failed to render" line
    // instead of vanishing without a trace.
    try {
      const tr = document.createElement("tr");
      tr.addEventListener("click", () => openDetail(job.id));

      tr.appendChild(el("td", "c-title", job.title || "(untitled)"));
      tr.appendChild(el("td", null, job.company || ""));
      tr.appendChild(el("td", job.salary ? "" : "c-muted", job.salary || "US$0"));
      tr.appendChild(el("td", null, job.location || ""));

      const st = document.createElement("td");
      const pill = el("span", "status-pill", job.status || "bookmarked");
      pill.dataset.status = job.status || "bookmarked";
      st.appendChild(pill);
      tr.appendChild(st);

      tr.appendChild(el("td", null, fmtDate(job.savedAt)));
      tr.appendChild(dateCell(job, "deadline"));
      tr.appendChild(dateCell(job, "appliedAt"));
      tr.appendChild(followCell(job));

      const ex = document.createElement("td");
      ex.appendChild(starsInline(job, (v) => saveField(job.id, "excitement", v)));
      tr.appendChild(ex);

      body.appendChild(tr);
    } catch (e) {
      console.error("[JobGrab tracker] row render failed for job", job.id, job.title, e);
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = COLUMNS.length;
      td.className = "c-muted";
      td.textContent = `Couldn't display "${job.title || job.id || "this job"}" — open the browser console for details.`;
      tr.appendChild(td);
      body.appendChild(tr);
    }
  });
}

function dateCell(job, field) {
  const td = document.createElement("td");
  const v = job[field];
  if (v) {
    const span = el("span", null, fmtDate(v));
    if (field === "deadline") { const du = daysUntil(v); if (du != null && du <= 7) span.className = "deadline-soon"; }
    td.appendChild(span);
  } else td.appendChild(el("span", "na", "N/A"));
  return td;
}
function followCell(job) {
  const td = document.createElement("td");
  const input = document.createElement("input");
  input.type = "date"; input.className = "mini-date"; input.value = isoDate(job.followUpAt);
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("change", (e) => saveField(job.id, "followUpAt", e.target.value));
  td.appendChild(input);
  return td;
}

// ---------- detail ----------
function openDetail(id) { activeId = id; activeTab = "info"; setView("detail"); renderDetail(); }

function renderDetail() {
  const host = $("detail-view");
  host.textContent = "";
  const job = allJobs.find((j) => j.id === activeId);
  if (!job) { setView("jobs"); return; }
  const node = $("detail-tpl").content.cloneNode(true);
  paintIcons(node); // back / delete icons on the cloned template

  node.querySelector("#d-back").addEventListener("click", () => { setView("jobs"); renderTable(); });
  node.querySelector("#d-title").textContent = job.title || "(untitled)";
  node.querySelector("#d-company").textContent = job.company || "";
  if (job.location) { node.querySelector("#d-loc-wrap").hidden = false; node.querySelector("#d-location").textContent = job.location; }
  node.querySelector("#d-savedon").textContent = fmtDate(job.savedAt);
  const src = node.querySelector("#d-source");
  src.href = job.url || "#";
  src.textContent = job.source === "linkedin" ? "linkedin.com" : (job.url || "").replace(/^https?:\/\//, "").split("/")[0] || "source";

  const stars = node.querySelector("#d-stars");
  const rating = Number(job.excitement) || 0;
  for (let i = 1; i <= 5; i++) {
    const s = el("span", "star" + (i <= rating ? " on" : ""), "★");
    s.addEventListener("click", () => saveField(job.id, "excitement", i === rating ? 0 : i));
    stars.appendChild(s);
  }

  const pipe = node.querySelector("#d-pipeline");
  const curIdx = STATUSES.indexOf(job.status);
  STATUSES.forEach((s, i) => {
    const b = el("button", "pipeline__step" + (i < curIdx ? " done" : i === curIdx ? " current" : ""), s);
    b.addEventListener("click", () => saveField(job.id, "status", s));
    pipe.appendChild(b);
  });

  node.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("is-active", t.dataset.tab === activeTab);
    t.addEventListener("click", () => { activeTab = t.dataset.tab; renderDetail(); });
  });
  node.querySelectorAll(".panelt").forEach((p) => { p.hidden = p.dataset.panel !== activeTab; });

  node.querySelectorAll("[data-field]").forEach((input) => {
    const f = input.dataset.field;
    if (f === "savedDate") { input.value = isoDate(job.savedAt); return; }
    let val = job[f] != null ? job[f] : "";
    if (input.type === "date") val = isoDate(val);
    input.value = val;
    if (f === "deadline") { const du = daysUntil(job.deadline); if (du != null && du <= 7) input.classList.add("deadline-soon"); }
    input.addEventListener("change", () => saveField(job.id, f, input.value));
  });

  if (job.contactLinkedIn) { const a = node.querySelector("#d-contact-open"); a.hidden = false; a.href = job.contactLinkedIn; }
  node.querySelector("#d-desc").textContent = htmlToText(job.descriptionHtml) || "No description captured.";
  node.querySelector("#d-delete").addEventListener("click", async () => { await deleteJob(job.id); activeId = null; setView("jobs"); await load(); });

  host.appendChild(node);
}

async function saveField(id, field, value) {
  const job = allJobs.find((j) => j.id === id);
  if (job) job[field] = value;
  await updateJob(id, { [field]: value });
  if (view === "detail") renderDetail();
  renderPipeline();
  if (view === "jobs") renderTable();
}

// ---------- add job ----------
async function addJob() {
  const { job } = await saveJob({ source: "manual", title: "New job", url: "" });
  await load();
  openDetail(job.id);
}

// ---------- data ----------
async function load() {
  allJobs = await getJobs();
  if (activeId && !allJobs.some((j) => j.id === activeId)) activeId = null;
  renderPipeline();
  if (view === "detail") renderDetail(); else renderTable();
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.jobs) load(); });

// ---------- CSV ----------
function exportCsv() {
  const cols = ["externalId", "title", "company", "location", "workplaceType", "employmentType",
    "salary", "status", "excitement", "posted", "deadline", "appliedAt", "followUpAt",
    "contactName", "contactTitle", "contactLinkedIn", "applyUrl", "url", "savedAt"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [cols.join(",")].concat(
    allJobs.map((j) => cols.map((c) => esc(c === "savedAt" ? new Date(j.savedAt).toISOString() : j[c])).join(",")));
  const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "jobgrab-export.csv"; a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- daily inspiration quote (rotates once per day) ----------
const QUOTES = [
  ["The only way to do great work is to love what you do.", "Steve Jobs"],
  ["Opportunities don't happen. You create them.", "Chris Grosser"],
  ["It always seems impossible until it's done.", "Nelson Mandela"],
  ["Success is not final, failure is not fatal: it is the courage to continue that counts.", "Winston Churchill"],
  ["Believe you can and you're halfway there.", "Theodore Roosevelt"],
  ["Your work is going to fill a large part of your life; the only way to be truly satisfied is to do what you believe is great work.", "Steve Jobs"],
  ["Don't watch the clock; do what it does. Keep going.", "Sam Levenson"],
  ["The future depends on what you do today.", "Mahatma Gandhi"],
  ["Persistence guarantees that results are inevitable.", "Paramahansa Yogananda"],
  ["A year from now you may wish you had started today.", "Karen Lamb"],
  ["The harder you work for something, the greater you'll feel when you achieve it.", "Anonymous"],
  ["Do not wait to strike till the iron is hot; but make it hot by striking.", "William Butler Yeats"],
  ["Every accomplishment starts with the decision to try.", "Anonymous"],
  ["Luck is what happens when preparation meets opportunity.", "Seneca"],
  ["Fall seven times, stand up eight.", "Japanese Proverb"],
];
function renderDailyQuote() {
  const box = document.getElementById("daily-quote");
  if (!box) return;
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const [text, author] = QUOTES[dayOfYear % QUOTES.length];
  box.textContent = "";
  box.append(el("span", "site-foot__quote-text", "“" + text + "”"),
    el("span", "site-foot__quote-by", " — " + author));
}

// ---------- error boundary: show errors instead of a blank page ----------
function showError(err) {
  const msg = (err && (err.stack || err.message)) || String(err);
  let box = document.getElementById("jg-error");
  if (!box) {
    box = document.createElement("pre");
    box.id = "jg-error";
    box.style.cssText = "margin:20px;padding:16px;border:1px solid #e3b7bc;background:#fff5f5;color:#b02a37;border-radius:10px;white-space:pre-wrap;font:12px/1.5 monospace;";
    document.body.appendChild(box);
  }
  box.textContent = "JobGrab tracker error:\n\n" + msg;
  console.error("[JobGrab tracker]", err);
}
window.addEventListener("error", (e) => showError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showError(e.reason));

// ---------- icons: paint every [data-icon] placeholder from the shared set ----------
function paintIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((node) => {
    const name = node.dataset.icon;
    const glyph = document.createElement("span");
    glyph.className = "ic";
    glyph.innerHTML = svg(name, node.classList.contains("nav__tab") ? 16 : 17);
    node.insertBefore(glyph, node.firstChild); // icon leads the label
    node.removeAttribute("data-icon"); // idempotent: don't double-paint on re-render
  });
}

// ---------- theme: OS default, with an explicit user override persisted locally ----------
function applyTheme(mode) {
  if (mode === "light" || mode === "dark") document.documentElement.dataset.theme = mode;
  else delete document.documentElement.dataset.theme;
}
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem("jobgrab-theme"); } catch (_) {}
  applyTheme(saved);
  const btn = $("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const isDark = document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("jobgrab-theme", next); } catch (_) {}
  });
}

// ---------- wire ----------
try {
  paintIcons();
  initTheme();
  document.querySelectorAll(".nav__tab").forEach((t) => t.addEventListener("click", () => { statusFilter = null; setView(t.dataset.view); if (t.dataset.view === "jobs") renderTable(); }));
  $("search").addEventListener("input", renderTable);
  $("export").addEventListener("click", exportCsv);
  $("add").addEventListener("click", addJob);
  renderDailyQuote();
  setView("jobs");
  load().catch(showError);
} catch (e) {
  showError(e);
}
