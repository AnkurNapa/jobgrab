import { getJobs, STATUSES } from "../lib/store.js";

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // textContent => safe against scraped HTML
  return n;
};

async function render() {
  const jobs = await getJobs();
  const counts = document.getElementById("counts");
  const recent = document.getElementById("recent");
  const empty = document.getElementById("empty");
  counts.textContent = "";
  recent.textContent = "";

  if (!jobs.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  jobs.forEach((j) => (byStatus[j.status] = (byStatus[j.status] || 0) + 1));
  STATUSES.forEach((s) => {
    const chip = el("span", "chip");
    chip.append(el("b", null, String(byStatus[s] || 0)), document.createTextNode(" " + s));
    counts.appendChild(chip);
  });

  jobs
    .slice()
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, 6)
    .forEach((j) => {
      const li = el("li");
      const a = el("a");
      a.href = j.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.append(
        el("div", "title", j.title || "(untitled)"),
        el("div", "sub", [j.company, j.location].filter(Boolean).join(" · "))
      );
      li.appendChild(a);
      recent.appendChild(li);
    });
}

document.getElementById("open-tracker").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("app/index.html") });
});

render();
