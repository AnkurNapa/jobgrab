// insights.js - pure functions that turn a job list into "needs attention"
// signals: overdue follow-ups, applications gone quiet, and deadlines coming
// up. Kept separate from store.js (persistence) and app.js (rendering) so
// both the tracker UI and the background service worker can share the exact
// same rules without importing the DOM-heavy app module.

import { daysUntil } from "./dates.js";

// A job still "in flight" -- bookmarked/accepted/rejected/ghosted are all
// terminal or not-yet-acted-on, so they're excluded from staleness checks.
const ACTIVE_STATUSES = new Set(["applying", "applied", "interviewing", "negotiating"]);

// No movement (no follow-up set, no deadline passed) for this many days
// after applying counts as "gone quiet."
export const STALE_DAYS = 10;
export const DEADLINE_SOON_DAYS = 7;

function isActive(job) {
  return ACTIVE_STATUSES.has(job.status);
}

// A follow-up date that has arrived or passed, on a job still in flight.
export function isOverdueFollowUp(job, now = Date.now()) {
  if (!isActive(job) || !job.followUpAt) return false;
  const d = daysUntil(job.followUpAt);
  return d != null && d <= 0;
}

// Applied (or later) and no follow-up is even scheduled, and it's been
// STALE_DAYS+ since the last real signal (appliedAt, falling back to
// savedAt for jobs marked applied without that date filled in).
export function isStaleApplication(job, now = Date.now()) {
  if (!isActive(job) || job.status === "applying") return false; // not applied yet, nothing to chase
  if (job.followUpAt) return false; // already scheduled -- isOverdueFollowUp covers it once due
  const anchor = job.appliedAt || (job.savedAt ? new Date(job.savedAt).toISOString().slice(0, 10) : null);
  if (!anchor) return false;
  const d = daysUntil(anchor);
  return d != null && d <= -STALE_DAYS;
}

export function isDeadlineSoon(job, now = Date.now()) {
  if (!job.deadline || job.status === "rejected" || job.status === "ghosted" || job.status === "accepted") return false;
  const d = daysUntil(job.deadline);
  return d != null && d >= 0 && d <= DEADLINE_SOON_DAYS;
}

// Classify every job, returning both per-category id lists (for filtering
// the table) and counts (for badges / notification text).
export function computeAttention(jobs, now = Date.now()) {
  const overdueFollowUp = [];
  const staleApplication = [];
  const deadlineSoon = [];
  for (const j of jobs) {
    if (isOverdueFollowUp(j, now)) overdueFollowUp.push(j.id);
    else if (isStaleApplication(j, now)) staleApplication.push(j.id); // don't double-count a job in both buckets
    if (isDeadlineSoon(j, now)) deadlineSoon.push(j.id);
  }
  const total = new Set([...overdueFollowUp, ...staleApplication, ...deadlineSoon]).size;
  return { overdueFollowUp, staleApplication, deadlineSoon, total };
}

// ---------- job-search health: funnel + behavior metrics ----------
// A job has left the "just looking" phase once it's applied or further.
// Rejected/ghosted are terminal but still count as having been applied to,
// so they belong in the funnel denominator, not just the numerator.
const APPLIED_OR_BEYOND = new Set(["applied", "interviewing", "negotiating", "accepted", "rejected", "ghosted"]);
const RESPONDED = new Set(["interviewing", "negotiating", "accepted", "rejected"]); // an explicit rejection is still a response
const INTERVIEWED = new Set(["interviewing", "negotiating", "accepted"]);

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Whole days between two ISO dates (b - a), or null if either is missing/unparseable.
function daysBetween(aISO, bISO) {
  if (!aISO || !bISO) return null;
  const a = new Date(aISO), b = new Date(bISO);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

const rate = (n, d) => (d > 0 ? n / d : null);

// The funnel counts (response/interview/ghost rate) in isolation, reusable
// for both the whole tracker and a single-platform slice of it.
function funnelCounts(jobs) {
  const appliedOrBeyond = jobs.filter((j) => APPLIED_OR_BEYOND.has(j.status));
  const responded = appliedOrBeyond.filter((j) => RESPONDED.has(j.status));
  const interviewed = appliedOrBeyond.filter((j) => INTERVIEWED.has(j.status));
  const ghosted = appliedOrBeyond.filter((j) => j.status === "ghosted");
  return {
    appliedTotal: appliedOrBeyond.length,
    respondedCount: responded.length,
    interviewedCount: interviewed.length,
    ghostedCount: ghosted.length,
    responseRate: rate(responded.length, appliedOrBeyond.length),
    interviewRate: rate(interviewed.length, appliedOrBeyond.length),
    ghostRate: rate(ghosted.length, appliedOrBeyond.length),
  };
}

export function computeSearchHealth(jobs, now = Date.now()) {
  const daysToApply = jobs
    .filter((j) => j.appliedAt && j.savedAt)
    .map((j) => daysBetween(new Date(j.savedAt).toISOString().slice(0, 10), j.appliedAt))
    .filter((d) => d != null && d >= 0);

  const daysAgo = (n) => new Date(now - n * 86400000).toISOString().slice(0, 10);
  const inWindow = (fromDaysAgo, toDaysAgo) => jobs.filter((j) => j.appliedAt && j.appliedAt >= daysAgo(fromDaysAgo) && j.appliedAt < daysAgo(toDaysAgo)).length;

  return {
    ...funnelCounts(jobs),
    medianDaysToApply: median(daysToApply),
    appliedLast7: inWindow(7, 0),
    appliedPrev7: inWindow(14, 7),
  };
}

// Same funnel, split by job.source -- "where should I actually be spending
// my time" is a different question from "how am I doing overall," and both
// come from data already on every job. Platforms with zero applied-or-beyond
// jobs are omitted entirely rather than shown as a wall of "--" rates.
export function computeSearchHealthByPlatform(jobs, now = Date.now()) {
  const bySource = new Map();
  for (const j of jobs) {
    const key = j.source || "unknown";
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(j);
  }
  const out = [];
  for (const [source, list] of bySource) {
    const f = funnelCounts(list);
    if (f.appliedTotal === 0) continue;
    out.push({ source, ...f });
  }
  out.sort((a, b) => b.appliedTotal - a.appliedTotal);
  return out;
}
