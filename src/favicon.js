// favicon.js — recolor the tab favicon to the surface's accent color, so the Graphite, Linear
// Issue, and Linear Review tabs for one PR (which all carry the same title) are distinguishable
// in the tab strip. GitHub is left alone: its PR favicon encodes CI status.
//
// Classic content script; attaches `GBL.applyFavicon` to the shared global (see CLAUDE.md
// "File worlds"). Called from content.js's tick(), so it self-heals when a site rewrites <head>.

(function () {
  "use strict";
  const GBL = (globalThis.GBL = globalThis.GBL || {});

  const LINK_ID = "gbl-favicon";
  const DISABLED_REL = "gbl-disabled-icon";

  // Copies of each site's own favicon.svg (app.graphite.com/favicon.svg,
  // linear.app/static/favicon.svg), with the black background square's fill replaced by {C}.
  const GRAPHITE =
    '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="16" height="16" ry="3.2" fill="{C}"/>' +
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M3.10115 3.1009L9.79325 1.3078L14.6923 6.2068L12.8991 12.8989L6.20695 14.692L1.30795 9.793L3.10115 3.1009ZM5.11335 12.9999L10.8869 12.9999L13.7736 7.9999L10.8869 2.9999L5.11335 2.9999L2.22665 7.9999L5.11335 12.9999ZM6.77378 3.42319L11.3505 4.64959L12.5769 9.22629L9.22638 12.5768L4.64968 11.3504L3.42328 6.77369L6.77378 3.42319Z" fill="white"/>' +
    "</svg>";
  const LINEAR =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
    '<rect width="16" height="16" rx="2" fill="{C}"/>' +
    '<path d="M2.147 9.383c-.027-.114.109-.186.192-.103l4.381 4.38c.083.083.011.219-.103.192a6.02 6.02 0 0 1-4.47-4.47ZM2 7.627a.12.12 0 0 0 .035.091l6.247 6.247a.12.12 0 0 0 .091.035q.428-.027.836-.111a.117.117 0 0 0 .057-.198L2.31 6.734a.117.117 0 0 0-.198.057 6 6 0 0 0-.11.836Zm.505-2.062a.12.12 0 0 0 .025.132l7.773 7.773a.12.12 0 0 0 .132.025q.322-.144.623-.322a.118.118 0 0 0 .022-.185L3.012 4.92a.118.118 0 0 0-.185.022q-.178.3-.322.623m1.014-1.396a.12.12 0 0 1-.005-.163 6.006 6.006 0 1 1 8.48 8.48.12.12 0 0 1-.163-.005z" fill="#FFF"/>' +
    "</svg>";

  const LOGOS = { graphite: GRAPHITE, linearIssue: LINEAR, linearReview: LINEAR };

  function iconFor(surface) {
    const logo = LOGOS[surface];
    const s = logo && (GBL.SURFACES || []).find((x) => x.key === surface);
    return s ? "data:image/svg+xml," + encodeURIComponent(logo.replace("{C}", s.color)) : null;
  }

  // Put back the site's own icon links (disabled below) and drop ours.
  function restore() {
    const ours = document.getElementById(LINK_ID);
    if (ours) ours.remove();
    for (const l of document.querySelectorAll("link[data-gbl-rel]")) {
      l.rel = l.dataset.gblRel;
      delete l.dataset.gblRel;
    }
  }

  // applyFavicon(surfaceKey | null) — idempotent; cheap enough to run every tick.
  function applyFavicon(surface) {
    const href = iconFor(surface);
    if (!href) return restore();
    const head = document.head;
    if (!head) return;
    // With several rel=icon links the browser picks by size/type, not order, so the site's own
    // links are disabled (rel renamed) rather than just outranked. Sites that re-add or
    // re-render theirs get caught on the next tick.
    for (const l of document.querySelectorAll('link[rel~="icon"]')) {
      if (l.id === LINK_ID) continue;
      l.dataset.gblRel = l.rel;
      l.rel = DISABLED_REL;
    }
    let ours = document.getElementById(LINK_ID);
    if (!ours) {
      ours = document.createElement("link");
      ours.id = LINK_ID;
      ours.rel = "icon";
      ours.type = "image/svg+xml";
    }
    if (ours.getAttribute("href") !== href) ours.setAttribute("href", href);
    if (ours.parentNode !== head) head.appendChild(ours);
  }

  GBL.applyFavicon = applyFavicon;
})();
