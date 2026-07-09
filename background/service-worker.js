// service-worker.js - message router. MV3 workers are ephemeral, so this holds
// no in-memory state; every handler reads/writes storage via the store module.

import { saveJob, findByExternalId, findByKey } from "../lib/store.js";

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
