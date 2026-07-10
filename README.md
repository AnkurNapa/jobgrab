# JobGrab — Job Tracker (v0.6)

![JobGrab](screenshots/banner-hero.png)

A Teal-style job-search companion. Sit on a job page on **LinkedIn, Indeed, Naukri, Wellfound, or
Glassdoor**, click **Save job**, and it grabs the title, company, location, salary, description
snapshot, and job ID into a local Kanban tracker — plus a Skills dashboard with a spider chart,
word cloud, and status breakdown of your whole search, and a Job search health row with response
rate, interview rate, and ghost rate.

## Video walkthrough

[![Watch the install + demo walkthrough](https://img.youtube.com/vi/F8AIdiV8dHw/0.jpg)](https://youtu.be/F8AIdiV8dHw)

[youtu.be/F8AIdiV8dHw](https://youtu.be/F8AIdiV8dHw) — install, save your first job, and a tour of
the tracker board.

## What it solves

Job hunting means constantly context-switching to a spreadsheet: copying the title, company,
salary, deadline, and recruiter contact by hand for every job you're considering, across however
many job boards you actually use — and that spreadsheet drifts out of date the moment you stop
maintaining it. JobGrab removes the copy-paste step entirely: one click on a job page on any
supported board captures everything automatically into a proper Kanban pipeline (Bookmarked →
Applying → Applied → Interviewing → Negotiating → Accepted, or Rejected/Ghosted), with follow-up
reminders and notes attached to each job — all stored locally in your own browser, no account or
server involved. A dedicated Skills tab then rolls all of that up into a dashboard: which skills
show up most across the titles you've saved, a word cloud from the actual job descriptions, a
status-distribution donut, and your top companies by job count.

## Supported job boards

| Board | Save button works on |
|---|---|
| LinkedIn | any `/jobs/...` page or open job panel |
| Indeed | `/viewjob` pages and the search-result inline panel |
| Naukri | `/job-listings-...` pages |
| Wellfound | `/jobs/<id>-...` pages |
| Glassdoor | `/job-listing/...` pages, and search pages (`/Job/...`, including `/Job/index.htm`) with a job open in the side panel, on any of glassdoor.com / .co.in / .co.uk / .de / .com.au / .ca / .ie / .sg / .fr |

Every job board gets its own scraper (`content/scraper-<site>.js`) sharing one parsing toolkit
(`content/scraper-lib.js`) and one floating-button/panel UI (`content/inject.js`) — see
"How this was made" below. Each row in the tracker shows a small colored **Platform** badge (LI,
Id, Nk, Wf, Gd) so you can tell at a glance where a job came from, and it's included in CSV export
and the Claude chat brief too.

## How it works

![How it works](screenshots/banner-how-it-works.png)

1. **Open a job** on any supported board — a floating teal "Save job" button appears on any job
   page or open panel.
2. **Click to auto-capture** — the matching `content/scraper-<site>.js` reads the page (JSON-LD
   `JobPosting` first where the site embeds it, hand-picked selectors as fallback, so it keeps
   working when a site's markup changes).
3. **Lands on your board** — saved to `chrome.storage.local`, deduped per-platform by job ID.
4. **Track it to the offer** — drag cards between pipeline stages, add notes/contacts, set
   follow-up dates, export to CSV anytime.

## How this was made

Built as a Manifest V3 Chrome extension with a layered architecture: per-site content scripts
(`content/scraper-linkedin.js`, `-indeed.js`, `-naukri.js`, `-wellfound.js`, `-glassdoor.js`) each
expose the same four-hook contract (`__jobGrabSource`, `__jobGrabCurrentId`, `__jobGrabOnJobPage`,
`__jobGrabScrape`) built on shared parsing helpers in `content/scraper-lib.js`; a single
`content/inject.js` (site-agnostic, no per-board logic of its own) drives the floating save button
and quick-add panel against whichever scraper is active, with a `MutationObserver` to survive each
site's single-page-app navigation. A stateless `background/service-worker.js` routes messages
between the popup, content scripts, and tracker, and separately runs the daily stale-application
check. `lib/store.js` is a thin persistence layer over `chrome.storage.local` with schema
migration on read; `lib/insights.js` holds the attention/health rules; `lib/platforms.js` holds
per-board display metadata. The tracker board (`app/`) and quick-add panel are vanilla
HTML/CSS/JS — no framework — with the panel rendered in a Shadow DOM so the host site's CSS can't
distort it. Built with [Claude Code](https://claude.com/claude-code).

## Screenshots

| Tracker board | Toolbar popup |
|---|---|
| ![Tracker board](screenshots/tracker-board.png) | ![Popup](screenshots/popup.png) |

The tracker board (`app/index.html`) lists saved jobs with search, status pipeline, and CSV export. The toolbar popup gives a one-click shortcut to open the full tracker. Both fill in with your saved jobs as soon as you start clicking **Save job** on any supported board — screenshots above show the empty starting state.

## Install (Load unpacked)

1. Open `chrome://extensions` in Chrome.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select this folder: `~/Desktop/teal-linkedin-tracker`.
4. Pin the JobGrab icon from the extensions menu.

## Use

1. Go to LinkedIn, Indeed, Naukri, Wellfound, or Glassdoor. A teal **JobGrab** button (with its icon) floats at the bottom-right on every page of a supported board.
   - On a job page it reads the job (see the "Supported job boards" table above for each site's job-page pattern). Off a job page it shows **Open a job**.
   - **Drag the button anywhere** — its position is remembered — so it never gets stuck under a site's own chat/messaging bubble.
2. Click it to save. If you switch jobs in a single-page-app panel (LinkedIn's split view, Indeed's search panel), it re-syncs and shows **Saved** for ones you already have.
3. Click the toolbar icon for a quick view, or **Open tracker** for the full board.
4. In the tracker: drag cards between columns (Bookmarked → Applied → Interviewing → Offer → Rejected), click a card to edit status/notes, and **Export CSV**.
5. Narrow the table with the **Platform** and **date-saved** dropdowns next to search -- Platform filters to one job board; the date filter is a rolling window (today / last 7 days / last 30 days / last 365 days) on when you saved the job, not a calendar boundary.

## If you don't see the button

Content-script changes need **both** reloads:

1. `chrome://extensions` → find JobGrab → click the **↻ reload** icon.
2. **Reload the job board tab** (Cmd+R). The button only injects on a fresh page load.
3. Open DevTools console on the job board and look for `[JobGrab]` logs — `started on ...` and `button mounted` confirm it is running. `Reload page` on the button means you reloaded the extension while the tab was open — just refresh the tab.

## What it captures (Teal-style record)

Auto-scraped where available, all editable:
title, company, company URL, location, workplace type (Remote/Hybrid), employment type,
applicants (LinkedIn) / experience (Naukri), salary, **job URL**, **apply URL**, posted date,
**last date to apply (deadline)**, **contact person + their title + LinkedIn profile URL**
(LinkedIn only — the other boards don't surface a named contact), and the full job description
snapshot. Coverage varies by board: LinkedIn's scraper is the most complete since it was built and
tuned first; Indeed, Wellfound, and Glassdoor lean on each site's JobPosting JSON-LD, which is
generally reliable for title/company/location/salary/dates but won't fill in company URL or apply
URL nearly as often. Naukri doesn't reliably embed JobPosting JSON-LD at all, so its scraper leans
on generic DOM heuristics and will need occasional touch-ups as Naukri's markup shifts. Plus your
own tracking: status (pipeline), excitement rating, notes, applied date, follow-up date.

## The inline panel

Clicking the floating button opens an editable quick-add panel (rendered in a Shadow DOM so the
host site's CSS can't distort it). It prefills from the page, lets you type the deadline / contact /
notes on the spot, and upserts — re-saving a job with a newly entered deadline updates the record.
A short chime + pop animation confirms each save (respects `prefers-reduced-motion`).

## The tracker (Teal-style)

Left job list + right detail pane with a clickable **chevron status pipeline**
(Bookmarked → Applying → Applied → Interviewing → Negotiating → Accepted → Rejected → Ghosted), a star
excitement rating, tabbed sections (Job Info, Notes, Contacts, Description), and a **Dates** row
(Posted / Saved / Deadline / Applied / Follow up). Every field autosaves; deadlines within 7 days
are highlighted. Export everything to CSV (UTF-8, Excel-safe). Status pills and the pipeline summary
cards are color-coded per stage (amber while applying/negotiating, green once accepted, red if
rejected, muted gray if ghosted) so where things stand reads at a glance.

## Chat with Claude

The **Chat with Claude** toolbar button (v0.3) turns the whole tracker into a markdown brief
(pipeline counts + a table of title, company, status, location, salary, dates, and notes for every
saved job), copies it to your clipboard, and opens `claude.ai/new` in its own **popup window docked
to the right edge of your screen** -- a real, fully-functional claude.ai session (not an iframe;
Anthropic blocks framing claude.ai) that sits beside the tracker like a side panel. Clicking the
button again reuses that same window and loads a fresh chat instead of stacking new windows.

A content script (`content/claude-autofill.js`) auto-types the job brief into Claude's message box
as soon as it loads, so you don't have to paste it yourself -- just review and hit enter. If Claude's
UI changes and autofill can't find the composer, the data is still on your clipboard as a fallback.
Then ask away -- "which of these should I follow up on this week," "summarize my Germany
applications," "which recruiters haven't replied in 10+ days." It uses your existing claude.ai
login: no API key, no server, and no data leaves your browser except through what's typed into that
one message.

## Stale-application detection and reminders

A job search spreadsheet never tells you who's gone quiet. JobGrab now does, via
`lib/insights.js` (shared by both the tracker UI and the background worker so the rules only
live in one place):

- **Follow-up due** -- an in-flight job (applying/applied/interviewing/negotiating) whose
  `followUpAt` date has arrived or passed.
- **Gone quiet** -- applied (or further) with no follow-up date even scheduled, and it's been
  10+ days since you applied (or saved it, if no applied date is set).
- **Deadline this week** -- `deadline` is within 7 days and the job isn't already
  rejected/ghosted/accepted.

Whenever any of these fire, a row of colored chips appears above the pipeline summary
(e.g. "3 Follow-up due", "2 Gone quiet") -- click one to filter the table down to just those
jobs. The extension's toolbar icon also gets a badge with the total count, updated live as you
edit jobs, and once a day (`background/service-worker.js`, `chrome.alarms`) you get a single OS
notification summarizing what needs attention -- clicking it opens the tracker. At most one
notification per calendar day, so it nudges instead of nagging.

## Job search health

The Skills tab now opens with a **Job search health** row, before the keyword breakdown --
funnel and pacing metrics computed by `computeSearchHealth()` in `lib/insights.js`:

- **Response rate** -- of everything applied-or-beyond, the share that got *any* reply (an
  explicit rejection counts as a response; only silence doesn't).
- **Interview rate** -- the share that reached interviewing or further.
- **Ghost rate** -- the share marked ghosted; the tile flags red once it crosses 50%.
- **Applied this week** -- with a trend against the prior 7 days, so you can tell if your
  application pace is picking up or stalling.
- **Median days to apply** -- from the day you bookmarked a job to the day you actually applied,
  a plain measure of how much you sit on saved jobs before acting.

These stay quiet (a one-line prompt instead of empty tiles) until at least one job has moved past
"bookmarked," so a brand-new tracker doesn't open on a wall of zeroes.

![Skills dashboard](screenshots/skills-dashboard.png)

A fourth nav tab rolls your saved jobs up into a dashboard, built entirely from data you already
captured — no extra tagging required:

- **Top skill callout + spider chart** — a fixed keyword dictionary (Python, SQL, AWS, Product
  Management, etc.) is matched against every saved job **title** (titles are always captured;
  descriptions aren't every time), counted, and the top 8 plotted on a radar chart.
- **Word cloud from job descriptions** — a broader, unfiltered view of whatever language actually
  shows up in the full description snapshots (when captured from an open job page), stop-words
  filtered out, sized by frequency.
- **Status distribution donut** — every saved job's current pipeline stage, color-matched to the
  same palette used in the table and pipeline summary.
- **Top companies bar chart** — which companies you've saved the most jobs from.

All four charts are hand-rolled inline SVG/CSS — no charting library — and follow the app's
light/dark theme automatically.

## Cross-platform duplicate warning

The same role often gets cross-posted to two or three boards. `lib/dedupe.js` runs a conservative
check at save time: **exact** normalized company match, plus a high word-overlap score on the
title (seniority/location filler words like "Senior" or "Remote" are stripped out first so they
don't inflate the match). If a likely duplicate is found on a *different* platform, the save panel
shows a dismissible warning naming the existing save — it never blocks the save or merges anything
automatically, since applying via two boards for the same role is sometimes a deliberate choice.
Same-platform duplicates are already caught by `lib/store.js`'s exact id/URL key, so this only
looks across boards, where a cross-posted role has no shared id to match on.

## By-platform search health

The Job search health row (Skills tab) breaks down response rate, interview rate, and ghost rate
**per platform** once you've applied to jobs on 2+ boards — `computeSearchHealthByPlatform()` in
`lib/insights.js`. This is the "where should I actually be spending my time" view: a platform with
a 2% response rate and one with 25% call for very different amounts of your effort, and that's
invisible in an aggregate number.

## Draft outreach (per-job Claude handoff)

A **Draft outreach** button on each job's detail view builds a Claude prompt from that job's title,
company, and captured description, plus your resume text if you've pasted one via **Set resume**
in the toolbar (stored locally, used only to tailor the prompt — never sent anywhere except the
Claude tab you open yourself). It reuses the same docked-window mechanism as **Chat with Claude**
(`sendToClaude()` in `app/app.js`), asking Claude to draft a short, specific outreach note or
cover-note paragraph you can review and send.

## JSON export / import (cross-device sync)

`chrome.storage.local` never leaves the machine on its own — a real gap for a job seeker switching
between a work and personal laptop. **Export JSON** downloads every field of every saved job,
full-fidelity (unlike CSV, which is a lossy snapshot for reading, not round-tripping). **Import
JSON** on another device merges it in via `importJobs()` in `lib/store.js`, which reuses the exact
same dedup/merge rule as a normal re-scrape: a job new to that device is added in full, and a job
that already exists there only has its editable fields merged in — so importing can never silently
overwrite an edit you made locally with a stale value from the export.

## How it works (architecture)

- `content/scraper-lib.js` + `content/scraper-<site>.js` — layered extraction per board: JSON-LD `JobPosting` where the site embeds it → hand-picked selectors as fallback. Never throws; degrades gracefully when a site's DOM changes.
- `content/inject.js` — floating button + `MutationObserver` to survive each site's single-page navigation. Site-agnostic; drives whichever scraper's `__jobGrab*` hooks are active.
- `background/service-worker.js` — message router plus the daily stale-application alarm/badge/notification logic (MV3 workers are ephemeral, so no in-memory state).
- `lib/store.js` — `chrome.storage.local` persistence, dedup by platform-specific job id (or URL), schema migration on read, plus bulk `importJobs()` for cross-device sync.
- `lib/insights.js` — attention rules (overdue follow-up, stale application, deadline soon) and search-health funnel math (overall and by-platform), shared by the tracker UI and the service worker.
- `lib/dedupe.js` — cross-platform duplicate detection, used only as a save-time warning.
- `lib/platforms.js` — per-board display metadata (label, color, badge abbreviation).
- `app/` — the tracker board UI (named `app/` not `tracker/` because ad/privacy blockers block URLs containing "tracker"). Scraped descriptions render as **plain text** (never raw innerHTML) to avoid XSS.

## Known limits

- Coverage varies by board — see "What it captures" above. Naukri in particular uses DOM
  heuristics (no reliable JobPosting JSON-LD) and will need touch-ups as its markup shifts.
- Data lives in `chrome.storage.local` on one browser profile; it doesn't sync across machines on
  its own — use **Export JSON** / **Import JSON** to move a tracker between devices.
- No automated test suite. Every feature in this README was hand-verified with synthetic data via
  `node --check` and inline sanity scripts before being wired into the UI, but there's no CI gate.
- Storage is local to this browser profile (no sync yet). Use Export CSV to back up.
