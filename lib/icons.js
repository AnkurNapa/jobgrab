// icons.js - one consistent inline-SVG icon set (24x24, 1.75 stroke, round caps).
// Single source so every glyph across the board, toolbar, nav and detail view
// shares the same weight and metrics. Icons inherit `currentColor`.

const P = {
  jobs: '<path d="M3 7h18v13H3z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6.1"/><path d="M17.5 14.4A5.5 5.5 0 0 1 20.5 20"/>',
  companies: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16"/><path d="M15 9h4a1 1 0 0 1 1 1v11"/><path d="M2 21h20"/><path d="M7 8h1M7 12h1M7 16h1M11 8h1M11 12h1M11 16h1"/>',
  skills: '<path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.9 4.9 2.8 2.8"/><path d="m16.3 16.3 2.8 2.8"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.9 19.1 2.8-2.8"/><path d="m16.3 7.7 2.8-2.8"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  sortUp: '<path d="m7 14 5-5 5 5"/>',
  sortDown: '<path d="m7 10 5 5 5-5"/>',
  sortNone: '<path d="m8 9 4-4 4 4"/><path d="m8 15 4 4 4-4"/>',
};

// Return an <svg> markup string for the named icon at the given pixel size.
export function svg(name, size = 18) {
  const body = P[name] || "";
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
    `stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Return a <span class="ic"> element wrapping the icon, ready to append.
export function iconEl(name, size = 18) {
  const s = document.createElement("span");
  s.className = "ic";
  s.innerHTML = svg(name, size);
  return s;
}
