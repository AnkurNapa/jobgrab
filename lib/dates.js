// dates.js - single source of truth for date parsing / formatting across JobGrab.
// All user-facing dates are stored as ISO "YYYY-MM-DD" strings; savedAt stays an
// epoch number (creation timestamp). These helpers coerce either form safely.

// Parse anything (epoch number, ISO string, Date-parseable string) to "YYYY-MM-DD".
// Returns "" when unparseable; passes through an already-ISO-ish string unchanged
// so partial user input is never silently dropped.
export function toISO(v) {
  if (v == null || v === "") return "";
  // Already an ISO calendar date: pass through so no timezone reparse can shift it.
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = typeof v === "number" ? new Date(v) : new Date(v);
  if (isNaN(d.getTime())) return typeof v === "string" ? v : "";
  return d.toISOString().slice(0, 10);
}

// Locale-formatted date for display (day/month/year). "" when unparseable.
export function fmt(v, locale = "en-GB") {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale);
}

// Whole days from now until v (negative = past). null when unparseable.
export function daysUntil(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : Math.ceil((d.getTime() - Date.now()) / 86400000);
}

// Fields persisted as ISO date strings (savedAt is intentionally excluded — epoch).
export const DATE_FIELDS = ["posted", "deadline", "appliedAt", "followUpAt", "reminderAt"];
