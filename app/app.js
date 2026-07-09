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
  $("stub-view").hidden = !(v === "people" || v === "companies");
  $("pipeline").style.display = v === "jobs" ? "" : "none";
  document.querySelector(".toolbar").style.display = v === "jobs" ? "" : "none";
  document.querySelectorAll(".nav__tab").forEach((t) =>
    t.classList.toggle("is-active", t.dataset.view === (v === "detail" ? "jobs" : v)));
  if (v === "people") renderPeople();
  if (v === "companies") renderCompanies();
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
    statuses.forEach((s) => stTd.appendChild(el("span", "status-pill", s)));
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

// ---------- pipeline summary ----------
function renderPipeline() {
  const pipe = $("pipeline");
  pipe.textContent = "";
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  allJobs.forEach((j) => { if (counts[j.status] != null) counts[j.status]++; });
  STATUSES.filter((s) => s !== "closed").forEach((s) => {
    const step = el("div", "pipe__step" + (statusFilter === s ? " is-active" : ""));
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
      st.appendChild(el("span", "status-pill", job.status || "bookmarked"));
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
