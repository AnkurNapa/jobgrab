// store.js - thin persistence layer over chrome.storage.local.
// v1 uses chrome.storage.local (simple, ample for hundreds of jobs). Swap for
// IndexedDB/Dexie later if lists grow large or full-text search is needed.

import { toISO, DATE_FIELDS } from "./dates.js";

const KEY = "jobs";
const SCHEMA_VERSION = 3; // bump when the on-read migration shape changes

// Teal-style pipeline. "closed" (v2) split into "rejected" and "ghosted" in
// v3 -- a single catch-all terminal state hid the difference between an
// explicit no and a recruiter who just stopped replying, which is useful
// signal for a job search. migrateJob() below maps old "closed" records
// to "rejected" so nothing already saved silently drops off the pipeline.
export const STATUSES = [
  "bookmarked", "applying", "applied", "interviewing", "negotiating", "accepted", "rejected", "ghosted",
];

function uuid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    "id-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
}

const MAX_DESC = 24000; // cap description size to protect the storage quota

// Normalize one stored job to the current schema (pure, non-persisting):
// coerce every date field to ISO "YYYY-MM-DD" and fold the legacy `postedAt`
// duplicate into `posted`. savedAt is left as an epoch number.
function migrateJob(j) {
  if (!j || typeof j !== "object") return j;
  const out = { ...j };
  for (const f of DATE_FIELDS) {
    if (out[f] != null && out[f] !== "") out[f] = toISO(out[f]);
  }
  if ((!out.posted || out.posted === "") && out.postedAt) out.posted = toISO(out.postedAt);
  if ("postedAt" in out) delete out.postedAt; // redundant with `posted`
  if (out.status === "closed") out.status = "rejected"; // v2 -> v3 status split
  out.version = SCHEMA_VERSION;
  return out;
}

export async function getJobs() {
  const res = await chrome.storage.local.get(KEY);
  const jobs = res[KEY];
  if (!Array.isArray(jobs)) return []; // guard against corruption / non-array
  return jobs.map(migrateJob);
}

// A job's identity: its numeric LinkedIn id when present, else its URL.
function keyOf(j) {
  return j.externalId ? "id:" + j.externalId : j.url ? "url:" + j.url.split("?")[0] : null;
}

// Fields a user may edit from the inline panel or the tracker drawer.
export const EDITABLE = [
  "status", "notes", "excitement",
  "posted", "deadline", "appliedAt", "followUpAt", "reminderAt",
  "contactName", "contactLinkedIn", "contactTitle",
  "applyUrl", "salary", "location", "title", "company",
];

export async function findByExternalId(externalId) {
  if (!externalId) return null;
  const jobs = await getJobs();
  return jobs.find((j) => j.externalId && j.externalId === externalId) || null;
}

// Find by numeric id or URL key. Used to prefill the panel with saved values.
export async function findByKey(k) {
  if (!k) return null;
  const jobs = await getJobs();
  return jobs.find((j) => keyOf(j) === k) || null;
}
export function makeKey(partial) { return keyOf(partial); }

function capDesc(o) {
  if (typeof o.descriptionHtml === "string" && o.descriptionHtml.length > MAX_DESC) {
    o.descriptionHtml = o.descriptionHtml.slice(0, MAX_DESC) + "…";
  }
  return o;
}
async function persist(jobs, job) {
  try {
    await chrome.storage.local.set({ [KEY]: jobs });
  } catch (e) {
    if (job) job.descriptionHtml = ""; // QUOTA exceeded: drop description, retry once
    await chrome.storage.local.set({ [KEY]: jobs });
  }
}

// A stale/mis-scraped externalId can collide with an unrelated job's key.
// Only treat it as the same job when title+company still roughly match --
// otherwise fall through and save it as a new record instead of silently
// overwriting a different job.
function looksLikeSameJob(a, b) {
  if (!a.title || !b.title) return true; // not enough info to tell them apart
  return a.title === b.title && (a.company || "") === (b.company || "");
}

// Upsert. Dedup by numeric id, falling back to URL. On an existing record,
// merge only the editable fields the caller supplied (so re-saving a page with
// an entered deadline/contact updates it without clobbering savedAt/status).
// Returns { job, duplicate, updated }.
export async function saveJob(partial, opts = {}) {
  const jobs = await getJobs();
  const k = keyOf(partial);
  if (k) {
    const idx = jobs.findIndex((j) => keyOf(j) === k && looksLikeSameJob(j, partial));
    if (idx !== -1) {
      const merge = opts.upsert ? EDITABLE : opts.mergeFields || [];
      let changed = false;
      for (const f of merge) {
        if (partial[f] !== undefined && partial[f] !== "" && partial[f] !== jobs[idx][f]) {
          jobs[idx][f] = partial[f];
          changed = true;
        }
      }
      if (changed) await persist(jobs, jobs[idx]);
      return { job: jobs[idx], duplicate: true, updated: changed };
    }
  }
  const job = migrateJob(capDesc({ id: uuid(), status: "bookmarked", savedAt: Date.now(), notes: "", ...partial }));
  jobs.push(job);
  await persist(jobs, job);
  return { job, duplicate: false, updated: false };
}

export async function updateJob(id, patch) {
  const jobs = await getJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx === -1) return null;
  jobs[idx] = { ...jobs[idx], ...patch };
  await chrome.storage.local.set({ [KEY]: jobs });
  return jobs[idx];
}

export async function deleteJob(id) {
  const jobs = await getJobs();
  await chrome.storage.local.set({ [KEY]: jobs.filter((j) => j.id !== id) });
}

// Bulk-load a full-fidelity JSON export (see app/app.js exportJson) into
// this browser -- the cross-device sync path, since chrome.storage.local
// never leaves the machine on its own. Reuses saveJob's existing dedup/merge
// exactly as a single re-scrape would: a job new to this device is added in
// full; a job that already exists here (same externalId/url) only has its
// EDITABLE fields merged in, so an import can never silently clobber
// non-editable data (descriptionHtml, scrapedFrom, etc.) or overwrite a
// locally-made edit with a stale value from the export.
export async function importJobs(importedJobs) {
  let added = 0, merged = 0, unchanged = 0, skipped = 0;
  for (const raw of importedJobs) {
    if (!raw || typeof raw !== "object") { skipped++; continue; }
    const { duplicate, updated } = await saveJob(raw, { upsert: true });
    if (!duplicate) added++;
    else if (updated) merged++;
    else unchanged++;
  }
  return { added, merged, unchanged, skipped, total: importedJobs.length };
}
