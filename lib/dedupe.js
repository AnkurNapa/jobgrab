// dedupe.js - fuzzy "is this the same role, posted on a different board"
// detection. Deliberately conservative: exact normalized-company match
// required, plus a high word-overlap threshold on the title, so it never
// auto-merges anything -- it only ever surfaces a dismissible warning at
// save time (see content/inject.js). Exact same-platform duplicates are
// already caught by store.js's externalId/url key; this only looks across
// platforms, where a role has no shared id to key off of.

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Seniority/location/filler words that would otherwise inflate similarity
// between genuinely different roles at the same company (e.g. "Senior" and
// "Remote" showing up in both titles tells you nothing about whether it's
// the same job).
const NOISE_WORDS = new Set([
  "senior", "sr", "jr", "junior", "ii", "iii", "iv", "i", "lead", "staff", "principal",
  "remote", "hybrid", "onsite", "the", "a", "an", "and", "or", "of", "for", "to", "in", "at",
]);

function titleTokens(title) {
  return new Set(normalize(title).split(" ").filter((t) => t && !NOISE_WORDS.has(t)));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export const TITLE_SIMILARITY_THRESHOLD = 0.6;

export function isLikelyDuplicate(a, b) {
  if (!a || !b) return false;
  if ((a.source || "unknown") === (b.source || "unknown")) return false; // same-platform dupes are handled by store.js's key
  const companyA = normalize(a.company), companyB = normalize(b.company);
  if (!companyA || !companyB || companyA !== companyB) return false;
  return jaccard(titleTokens(a.title), titleTokens(b.title)) >= TITLE_SIMILARITY_THRESHOLD;
}

// Scan existing jobs for likely duplicates of `candidate` (a not-yet-saved
// scrape). Returns matches sorted most-similar first.
export function findPossibleDuplicates(candidate, existingJobs) {
  const candTokens = titleTokens(candidate.title);
  return existingJobs
    .filter((j) => isLikelyDuplicate(candidate, j))
    .map((j) => ({ job: j, similarity: jaccard(candTokens, titleTokens(j.title)) }))
    .sort((a, b) => b.similarity - a.similarity);
}
