// service-worker.js - message router. MV3 workers are ephemeral, so this holds
// no in-memory state; every handler reads/writes storage via the store module.

import { saveJob, findByExternalId, findByKey, getJobs } from "../lib/store.js";
import { computeAttention } from "../lib/insights.js";
import { findPossibleDuplicates } from "../lib/dedupe.js";

const DAILY_ALARM = "jobgrab-daily-check";
const LAST_NOTIFY_KEY = "jobgrabLastNotifyDate";
const todayKey = () => new Date().toISOString().slice(0, 10);

async function updateBadge(attention) {
  const a = attention || computeAttention(await getJobs());
  const text = a.total > 0 ? String(a.total) : "";
  await chrome.action.setBadgeText({ text });
  if (a.total > 0) await chrome.action.setBadgeBackgroundColor({ color: "#D64545" });
}

// Runs on the daily alarm: refresh the badge, and once per calendar day (not
// once per alarm fire, in case of missed/retried alarms) push a single
// digest notification if anything needs attention.
async function checkAndNotify() {
  const jobs = await getJobs();
  const attention = computeAttention(jobs);
  await updateBadge(attention);
  if (attention.total === 0) return;

  const { [LAST_NOTIFY_KEY]: lastDate } = await chrome.storage.local.get(LAST_NOTIFY_KEY);
  if (lastDate === todayKey()) return;

  const parts = [];
  if (attention.overdueFollowUp.length) parts.push(`${attention.overdueFollowUp.length} follow-up${attention.overdueFollowUp.length === 1 ? "" : "s"} due`);
  if (attention.staleApplication.length) parts.push(`${attention.staleApplication.length} application${attention.staleApplication.length === 1 ? "" : "s"} gone quiet`);
  if (attention.deadlineSoon.length) parts.push(`${attention.deadlineSoon.length} deadline${attention.deadlineSoon.length === 1 ? "" : "s"} this week`);

  await chrome.notifications.create("jobgrab-daily-digest", {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "JobGrab: your job search needs a look",
    message: parts.join(" · "),
    priority: 1,
  });
  await chrome.storage.local.set({ [LAST_NOTIFY_KEY]: todayKey() });
}

chrome.notifications.onClicked.addListener((id) => {
  if (id !== "jobgrab-daily-digest") return;
  chrome.tabs.create({ url: chrome.runtime.getURL("app/index.html") });
  chrome.notifications.clear(id);
});

function scheduleDailyAlarm() {
  chrome.alarms.create(DAILY_ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => { scheduleDailyAlarm(); checkAndNotify(); });
chrome.runtime.onStartup.addListener(() => { scheduleDailyAlarm(); checkAndNotify(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === DAILY_ALARM) checkAndNotify(); });

// Keep the badge live the moment a job is edited, without waiting for the
// next daily alarm -- cheap (no notification, just a recount).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.jobs) updateBadge();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === "SAVE_JOB") {
        const { job, duplicate, updated } = await saveJob(msg.job, { upsert: true });
        sendResponse({ ok: true, duplicate, updated, id: job.id });
        return;
      }
      if (msg && msg.type === "CHECK_JOB") {
        const existing = await findByExternalId(msg.externalId);
        sendResponse({ ok: true, exists: !!existing });
        return;
      }
      if (msg && msg.type === "GET_JOB") {
        const existing = await findByKey(msg.key);
        sendResponse({ ok: true, job: existing || null });
        return;
      }
      if (msg && msg.type === "FIND_DUPLICATES") {
        const jobs = await getJobs();
        const matches = findPossibleDuplicates(msg.candidate || {}, jobs);
        sendResponse({ ok: true, matches: matches.map((m) => ({ source: m.job.source, title: m.job.title, status: m.job.status, similarity: m.similarity })) });
        return;
      }
      if (msg && msg.type === "OPEN_TRACKER") {
        // Open the board from the extension context (chrome.tabs.create), not via
        // window.open on linkedin.com, which page-context blockers can intercept.
        chrome.tabs.create({ url: chrome.runtime.getURL("app/index.html") });
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false, error: "unknown message type" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // keep the message channel open for the async response
});
