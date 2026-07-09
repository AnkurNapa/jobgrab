// inject.js - floating JobGrab button that opens an inline editable panel on
// LinkedIn job pages. Hardened for iframes, SPA route changes, DOM churn,
// double-clicks, storage limits and extension reloads. The panel lives in a
// Shadow DOM so LinkedIn's CSS cannot distort the form.

(function () {
  if (window.top !== window.self) return; // avoid duplicate buttons in iframes

  const BTN_ID = "jobgrab-save-btn";
  const HOST_ID = "jobgrab-panel-host";
  const STATUSES = ["bookmarked", "applying", "applied", "interviewing", "negotiating", "accepted", "closed"];
  let ICON_URL = "";
  try { ICON_URL = chrome.runtime.getURL("icons/icon48.png"); } catch (_) {}

  let lastUrl = location.href, lastJobId = null, saving = false, dead = false;
  let panelOpen = false, currentScrape = null;

  const log = (...a) => { try { console.log("%c[JobGrab]", "color:#0a7d6b;font-weight:bold", ...a); } catch (_) {} };

  // ---------- Save feedback: a short chime + a pop animation ----------
  let audioCtx = null;
  function playChime() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const now = audioCtx.currentTime;
      const notes = [880, 1174.66]; // A5 -> D6, a bright two-note "ding"
      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = now + i * 0.09;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.24);
      });
    } catch (_) {}
  }
  function animateSaved() {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    btn.classList.remove("jobgrab-pop");
    void btn.offsetWidth; // reflow so the animation can retrigger
    btn.classList.add("jobgrab-pop");
    setTimeout(() => btn.classList.remove("jobgrab-pop"), 650);
  }
  function celebrate() { playChime(); animateSaved(); }
  const contextAlive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };
  function handleDead() { if (dead) return; dead = true; setButtonState("error", "Reload page"); closePanel(); log("context invalidated - reload tab"); }

  function currentJobId() {
    let u; try { u = new URL(location.href); } catch (_) { return null; }
    return u.searchParams.get("currentJobId") || (location.pathname.match(/\/jobs\/view\/(\d+)/) || [])[1] || null;
  }
  const onJobContext = () => /\/jobs\//.test(location.pathname) || !!currentJobId();
  async function send(msg) { if (!contextAlive()) { handleDead(); throw new Error("dead"); } return chrome.runtime.sendMessage(msg); }

  // ---------- Floating button ----------
  function applyPos(btn, pos) {
    if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
      btn.style.left = pos.left + "px"; btn.style.top = pos.top + "px";
      btn.style.right = "auto"; btn.style.bottom = "auto";
    }
  }
  function loadPos(btn) { if (!contextAlive()) return; try { chrome.storage.local.get("fabPos", (r) => { if (!chrome.runtime.lastError) applyPos(btn, r.fabPos); }); } catch (_) {} }
  function savePos(pos) { if (!contextAlive()) return; try { chrome.storage.local.set({ fabPos: pos }); } catch (_) {} }
  function makeDraggable(btn) {
    let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    btn.addEventListener("mousedown", (e) => { dragging = true; moved = false; const r = btn.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; e.preventDefault(); });
    window.addEventListener("mousemove", (e) => { if (!dragging) return; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; applyPos(btn, { left: Math.max(0, Math.min(innerWidth - 60, ox + dx)), top: Math.max(0, Math.min(innerHeight - 40, oy + dy)) }); });
    window.addEventListener("mouseup", () => { if (!dragging) return; dragging = false; if (moved) { const r = btn.getBoundingClientRect(); savePos({ left: r.left, top: r.top }); } });
    btn.addEventListener("click", (e) => { if (moved) { e.stopImmediatePropagation(); e.preventDefault(); moved = false; } }, true);
  }
  function makeButton() {
    if (dead || document.getElementById(BTN_ID) || !document.body) return;
    const btn = document.createElement("button");
    btn.id = BTN_ID; btn.className = "jobgrab-fab"; btn.type = "button";
    btn.title = "JobGrab (drag to move)";
    if (ICON_URL) { const img = document.createElement("img"); img.className = "jobgrab-fab__img"; img.src = ICON_URL; img.alt = ""; img.addEventListener("error", () => img.remove()); btn.appendChild(img); }
    const label = document.createElement("span"); label.className = "jobgrab-fab__label"; label.textContent = "Save job"; btn.appendChild(label);
    btn.addEventListener("click", togglePanel);
    makeDraggable(btn);
    document.body.appendChild(btn); loadPos(btn); log("button mounted");
  }
  function setButtonState(state, text) {
    const btn = document.getElementById(BTN_ID); if (!btn) return;
    btn.dataset.state = state;
    const label = btn.querySelector(".jobgrab-fab__label"); if (label && text) label.textContent = text;
  }
  async function reflectSavedState() {
    if (dead) return;
    if (!onJobContext()) return setButtonState("nojob", "Open a job");
    const id = currentJobId(); if (!id) return setButtonState("idle", "Save job");
    try { const res = await send({ type: "CHECK_JOB", externalId: id }); setButtonState(res && res.exists ? "exists" : "idle", res && res.exists ? "Saved" : "Save job"); } catch (_) {}
  }

  // ---------- Inline editable panel (Shadow DOM) ----------
  const FIELDS = [
    ["title", "Title", "text"], ["company", "Company", "text"],
    ["status", "Status", "select"], ["deadline", "Last date to apply", "date"],
    ["salary", "Salary", "text"], ["location", "Location", "text"],
    ["applyUrl", "Apply URL", "url"],
    ["contactName", "Contact person", "text"], ["contactTitle", "Contact title", "text"],
    ["contactLinkedIn", "Contact LinkedIn", "url"],
    ["notes", "Notes", "textarea"],
  ];
  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (host) return host.shadowRoot;
    host = document.createElement("div"); host.id = HOST_ID; document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .p { position: fixed; right: 20px; bottom: 74px; width: 320px; max-height: 74vh; overflow-y: auto;
             background:#fff; color:#1a1f24; border:1px solid #e5e7eb; border-radius:14px;
             box-shadow:0 12px 40px rgba(0,0,0,.22); z-index:2147483646;
             font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; padding:14px; }
        .hd { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .hd b { color:#0a7d6b; font-size:14px; } .x { border:0; background:none; font-size:20px; cursor:pointer; color:#6b7280; }
        .meta { color:#6b7280; font-size:11.5px; margin:-2px 0 10px; }
        label { display:block; font-weight:600; color:#6b7280; font-size:11px; margin:8px 0 2px; }
        input,select,textarea { width:100%; box-sizing:border-box; padding:7px 8px; border:1px solid #e5e7eb;
             border-radius:8px; font:inherit; color:#1a1f24; background:#fff; }
        textarea { resize:vertical; min-height:52px; }
        .row { display:flex; gap:8px; } .row > div { flex:1; }
        .actions { display:flex; gap:8px; margin-top:12px; align-items:center; }
        .save { flex:1; padding:9px; border:0; border-radius:8px; background:#0a7d6b; color:#fff; font-weight:700; cursor:pointer; }
        .save[disabled] { background:#9ca3af; cursor:default; }
        .link { color:#0a7d6b; font-weight:600; text-decoration:none; font-size:12px; }
        .status { font-size:12px; color:#157347; min-height:14px; margin-top:6px; }
        .status.err { color:#b02a37; }
        .hidden { display:none; }
      </style>
      <div class="p" role="dialog" aria-label="Save job to JobGrab">
        <div class="hd"><b>Save to JobGrab</b><button class="x" title="Close">&times;</button></div>
        <div class="meta" id="meta"></div>
        <div id="form"></div>
        <div class="actions">
          <button class="save" id="save">Save job</button>
          <a class="link" id="open" href="#">Tracker &rarr;</a>
        </div>
        <div class="status" id="msg"></div>
      </div>`;
    // Build fields
    const form = root.getElementById("form");
    for (const [key, lbl, type] of FIELDS) {
      const wrap = document.createElement("div");
      const l = document.createElement("label"); l.textContent = lbl; l.setAttribute("for", "f_" + key);
      let input;
      if (type === "select") { input = document.createElement("select"); STATUSES.forEach((s) => { const o = document.createElement("option"); o.value = s; o.textContent = s; input.appendChild(o); }); }
      else if (type === "textarea") input = document.createElement("textarea");
      else { input = document.createElement("input"); input.type = type; }
      input.id = "f_" + key; input.dataset.key = key;
      wrap.append(l, input); form.appendChild(wrap);
    }
    root.querySelector(".x").addEventListener("click", closePanel);
    root.getElementById("save").addEventListener("click", onSave);
    root.getElementById("open").addEventListener("click", (e) => {
      e.preventDefault();
      // Prefer opening from the extension context (dodges page-context blockers);
      // fall back to window.open if messaging is unavailable.
      try { chrome.runtime.sendMessage({ type: "OPEN_TRACKER" }); }
      catch (_) { try { window.open(chrome.runtime.getURL("app/index.html"), "_blank"); } catch (_) {} }
    });
    return root;
  }
  function setVal(root, key, v) { const el = root.getElementById("f_" + key); if (el && v != null) el.value = v; }
  function getVal(root, key) { const el = root.getElementById("f_" + key); return el ? el.value.trim() : ""; }

  async function openPanel() {
    if (dead) return;
    const root = ensureHost();
    root.querySelector(".p").classList.remove("hidden");
    const msg = root.getElementById("msg"); msg.textContent = ""; msg.classList.remove("err");
    panelOpen = true;

    if (!onJobContext()) {
      root.getElementById("meta").textContent = "Open a specific job posting to autofill its details.";
      currentScrape = null;
    } else {
      const s = window.__jobGrabScrape ? window.__jobGrabScrape() : null;
      currentScrape = s || { source: "linkedin", externalId: currentJobId(), url: location.href };
      const parts = [s && s.workplaceType, s && s.employmentType, s && s.applicants, s && s.postedText].filter(Boolean);
      root.getElementById("meta").textContent = parts.join(" · ") || "Details autofilled where available. Add deadline / contact below.";
      // Prefill from scrape
      FIELDS.forEach(([k]) => setVal(root, k, (s && s[k]) || ""));
      // Merge already-saved values (they win, so your entered deadline/contact persist)
      try {
        const key = currentScrape.externalId ? "id:" + currentScrape.externalId : "url:" + (currentScrape.url || location.href).split("?")[0];
        const res = await send({ type: "GET_JOB", key });
        if (res && res.job) { FIELDS.forEach(([k]) => { if (res.job[k]) setVal(root, k, res.job[k]); }); msg.textContent = "Already saved - editing updates it."; }
      } catch (_) {}
    }
  }
  function closePanel() { const host = document.getElementById(HOST_ID); if (host && host.shadowRoot) host.shadowRoot.querySelector(".p").classList.add("hidden"); panelOpen = false; }
  function togglePanel() { panelOpen ? closePanel() : openPanel(); }

  async function onSave() {
    if (dead || saving) return;
    const root = ensureHost(); const msg = root.getElementById("msg"); const btn = root.getElementById("save");
    const payload = { ...(currentScrape || {}) };
    FIELDS.forEach(([k]) => { const v = getVal(root, k); if (v) payload[k] = v; });
    if (!payload.title && !payload.company) { msg.textContent = "Enter at least a title or company."; msg.classList.add("err"); return; }
    if (!payload.url) payload.url = location.href;
    if (!payload.source) payload.source = "linkedin";
    saving = true; btn.disabled = true; msg.classList.remove("err"); msg.textContent = "Saving...";
    try {
      const res = await send({ type: "SAVE_JOB", job: payload });
      if (res && res.ok) { msg.textContent = res.duplicate ? (res.updated ? "Updated." : "Already saved.") : "Saved."; setButtonState("exists", "Saved"); if (!res.duplicate || res.updated) celebrate(); setTimeout(closePanel, 900); }
      else { msg.textContent = "Save failed."; msg.classList.add("err"); }
    } catch (e) { if (!contextAlive()) handleDead(); else { msg.textContent = "Save failed."; msg.classList.add("err"); } }
    finally { saving = false; btn.disabled = false; }
  }

  // ---------- SPA navigation handling ----------
  function onMaybeNavigated() {
    if (dead) return;
    makeButton();
    const url = location.href, id = currentJobId();
    if (url !== lastUrl || id !== lastJobId) { lastUrl = url; lastJobId = id; if (panelOpen) closePanel(); reflectSavedState(); }
  }
  ["pushState", "replaceState"].forEach((m) => { const orig = history[m]; history[m] = function () { const r = orig.apply(this, arguments); queueMicrotask(onMaybeNavigated); return r; }; });
  window.addEventListener("popstate", onMaybeNavigated);

  let scheduled = false;
  const observer = new MutationObserver(() => { if (scheduled || dead) return; scheduled = true; setTimeout(() => { scheduled = false; onMaybeNavigated(); }, 400); });

  function start() {
    makeButton(); lastUrl = location.href; lastJobId = currentJobId(); reflectSavedState();
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    let tries = 0; const iv = setInterval(() => { if (dead) return clearInterval(iv); makeButton(); if (document.getElementById(BTN_ID) || ++tries > 12) clearInterval(iv); }, 700);
    log("started on", location.href);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
