// claude-autofill.js - runs on claude.ai. When JobGrab's "Chat with Claude"
// button drops a pending brief into chrome.storage.local, this script waits
// for the message composer to exist and types the brief into it. It does
// NOT send the message -- the user reviews and hits enter themselves.
//
// claude.ai's compose box is a ProseMirror contenteditable whose exact
// classnames change across releases, so we don't hardcode one. Instead we
// pick the most likely candidate generically: the largest visible
// contenteditable element on the page.

const PENDING_KEY = "jobgrabPendingChat";
const MAX_AGE_MS = 60_000; // ignore stale pending briefs (e.g. an old tab reopened)
const WAIT_MS = 15_000;
const POLL_MS = 250;

function findComposer() {
  const candidates = Array.from(document.querySelectorAll('[contenteditable="true"]'));
  const visible = candidates.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 100 && r.height > 0 && el.offsetParent !== null;
  });
  if (!visible.length) return null;
  // The message composer is reliably the widest contenteditable on the page.
  visible.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
  return visible[0];
}

function insertText(el, text) {
  el.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.addRange(range);
  const ok = document.execCommand && document.execCommand("insertText", false, text);
  if (!ok) {
    // Fallback for editors that ignore execCommand: set text and fire the
    // events a React-controlled contenteditable listens for.
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
  }
}

async function run() {
  let pending;
  try {
    const res = await chrome.storage.local.get(PENDING_KEY);
    pending = res[PENDING_KEY];
  } catch (_) {
    return; // extension context gone (e.g. reloaded mid-navigation)
  }
  if (!pending || !pending.text) return;
  if (Date.now() - pending.ts > MAX_AGE_MS) {
    await chrome.storage.local.remove(PENDING_KEY);
    return;
  }

  const start = Date.now();
  const timer = setInterval(async () => {
    const composer = findComposer();
    if (composer) {
      clearInterval(timer);
      insertText(composer, pending.text);
      await chrome.storage.local.remove(PENDING_KEY);
    } else if (Date.now() - start > WAIT_MS) {
      clearInterval(timer); // give up quietly; the clipboard copy is still the fallback
    }
  }, POLL_MS);
}

run();
