// content.js — idempotent renderer. Detects the surface, scrapes the current page for
// cross-tool links, asks the service worker for the merged record (falls back to a
// current-page-only record if the SW isn't reachable), and renders the navbar.
//
// Classic content script; uses the shared `GBL` global from surfaces.js / navbar.styles.js.

(function () {
  "use strict";
  const GBL = globalThis.GBL;
  if (!GBL || !GBL.parse) return; // surfaces.js must load first
  if (window.top !== window) return; // top frame only

  const HOST_ID = "graptilubear-navbar-host";
  const COLLAPSE_KEY = "gbl.collapsed";
  const SCRAPE_RETRY_MAX = 15; // ~10s of 0.7s ticks while links are still unresolved
  const BAR_HEIGHT = 34; // .gbl-bar 32px + 2px border — keep in sync with navbar.styles.js

  let collapsed = false;
  let lastUrl = null;
  let attempts = 0;
  let pushedPx = -1;

  // Reserve BAR_HEIGHT at the top by translating <body> down. A transform makes <body> the
  // containing block for the site's own position:fixed / sticky headers and panes, so they ride
  // down with the page (margin/padding leaves them overlapping; on Linear, whose whole app shell
  // — including the fixed left navbar — is position:fixed, only a transform on <body> shifts it).
  // The navbar host is on <html>, not <body>, so it stays pinned in the reserved gap. Side effect:
  // the transform desyncs the sites' JS-positioned overlays — corrected by applyOverlayFix. We
  // reapply if the page (Linear's SPA) wipes our inline transform, so the push self-heals.
  function applyPush(px) {
    applyOverlayFix(px);
    const b = document.body;
    if (!b) return;
    const want = px ? `translateY(${px}px)` : "";
    if (b.style.transform === want && pushedPx === px) return;
    b.style.transform = want;
    pushedPx = px;
  }

  // The body transform desyncs every JS-positioned overlay by exactly BAR_HEIGHT, but in opposite
  // directions depending on how the overlay is positioned — so the correction is per-mechanism.
  // A PAGE-level stylesheet is required either way (the shadow-root style can't reach the light
  // DOM); it's toggled in lockstep with the push and only present while the transform is applied.
  //
  //  • GitHub tooltips/menus are `[popover]` elements promoted to the TOP LAYER, whose containing
  //    block is the viewport — so they IGNORE the transform while their anchors (inside <body>)
  //    ride down with it, landing the popover BAR_HEIGHT too HIGH (on top of the button). Push it
  //    back down with `margin-top`.
  //
  //  • Linear tooltips/hover-cards are Popper portals (`[data-popper-placement]`) — position:fixed
  //    inside the transformed <body>, so they get shifted BAR_HEIGHT too LOW (over the cursor).
  //    Pull them back up. Popper drives them with an inline `transform`, which `margin-top` can't
  //    move; the separate `translate` property composes with that transform instead of clobbering
  //    it. Vertical only — the desync is purely the translateY of the push.
  //
  //  • GitHub dialogs/drawers (Primer React `Dialog`, e.g. the "Merge status" drawer behind the
  //    merge-state button) sit in a `prc-Dialog-Backdrop-<hash>` that is position:fixed; inset:0
  //    INSIDE the transformed <body> — so its containing block is the whole body, not the
  //    viewport: the backdrop becomes document-tall and the drawer centers somewhere mid-page.
  //    Re-pin it to the viewport below the bar: `top` = the viewport's current offset within
  //    <body>, height = viewport minus bar, and cap the dialog at the backdrop's height. The
  //    offset is only stable because Primer locks page scroll while a dialog is open; it's
  //    captured on every click/keydown (see start()), i.e. just before any dialog can open.
  //
  // Each selector is inert on the other sites (GitHub has no Popper portals; Linear emits no
  // `[popover]`; only GitHub uses Primer), so the one rule set is safe everywhere.
  let overlayFixEl = null;
  function applyOverlayFix(px) {
    if (!px) {
      if (overlayFixEl) {
        overlayFixEl.remove();
        overlayFixEl = null;
      }
      return;
    }
    if (!overlayFixEl || !overlayFixEl.isConnected) {
      overlayFixEl = document.createElement("style");
      overlayFixEl.id = "gbl-overlay-fix";
      (document.head || document.documentElement).appendChild(overlayFixEl);
    }
    // Viewport top (just under the bar) expressed in <body>'s coordinates; body's rect includes
    // the transform.
    const vpTop = document.body ? Math.round(px - document.body.getBoundingClientRect().top) : 0;
    const css =
      `[popover]:popover-open{margin-top:${px}px !important}` +
      `[data-popper-placement]{translate:0 -${px}px !important}` +
      `[class*="prc-Dialog-Backdrop"]{top:${vpTop}px !important;bottom:auto !important;` +
      `height:calc(100vh - ${px}px) !important}` +
      `[class*="prc-Dialog-Backdrop"]>[class*="prc-Dialog-Dialog"]{max-height:100% !important}`;
    if (overlayFixEl.textContent !== css) overlayFixEl.textContent = css;
  }

  // --- scraping (see CLAUDE.md "Fragile selectors") ------------------------------------

  function classifyLinear(href, into) {
    const p = GBL.parse(GBL.absolute(href));
    if (!p) return;
    if (p.surface === "linearIssue" && (!into.linearIssue || (!into.linearIssue.slug && p.slug))) {
      into.linearIssue = { workspace: p.workspace, issueId: p.issueId, slug: p.slug };
    } else if (p.surface === "linearReview" && !into.linearReview) {
      into.linearReview = { workspace: p.workspace, slug: p.slug, hash: p.hash };
    }
  }

  function scrapeGithub() {
    const obs = {};
    document
      .querySelectorAll('.comment-body a[href*="linear.app"]')
      .forEach((a) => classifyLinear(a.getAttribute("href"), obs));
    return obs;
  }

  // The review's own PR is the header button labelled "<org>/<repo>#<n>, pull request actions"
  // (present on the Overview, Guide and Diff tabs). The Overview tab also lists the stack's other
  // PRs ("Linked pull request, … #10867 …"), which is why we key on this label and not on a "#n".
  // There is no github.com/…/pull/ anchor on the page any more; kept as a fallback.
  const REVIEW_PR_LABEL = /^([^/\s]+)\/([^#\s]+)#(\d+), pull request actions$/;

  function scrapeLinearReview() {
    const obs = {};
    const prs = new Map();
    for (const b of document.querySelectorAll('[aria-label$=", pull request actions"]')) {
      const m = REVIEW_PR_LABEL.exec(b.getAttribute("aria-label") || "");
      if (m) prs.set(`${m[1]}/${m[2]}#${m[3]}`, { org: m[1], repo: m[2], prNumber: Number(m[3]) });
    }
    if (!prs.size) {
      const gh = document.querySelector('a[href*="github.com"][href*="/pull/"]');
      const p = gh && GBL.parse(GBL.absolute(gh.getAttribute("href")));
      if (p && p.surface === "github") obs.pr = { org: p.org, repo: p.repo, prNumber: p.prNumber };
    } else if (prs.size === 1) {
      obs.pr = [...prs.values()][0];
    }
    const iss = document.querySelector('a[href*="/issue/"]');
    if (iss) {
      const p = GBL.parse(GBL.absolute(iss.getAttribute("href")));
      if (p && p.surface === "linearIssue")
        obs.linearIssue = { workspace: p.workspace, issueId: p.issueId, slug: p.slug };
    }
    return obs;
  }

  function scrapeLinearIssue() {
    // An issue can link MANY PRs (epic-style — e.g. ABC-123 links 13). Each attachment is a
    // /review/ anchor whose subtree text shows a PR "#<n>". If there's exactly ONE it's
    // unambiguous and safe to remember; if several, stay quiet and let memory recency (the
    // most-recently-visited PR/review for this issue) drive the buttons — writing them all
    // would balloon the record and clobber that recency signal.
    const byHash = new Map();
    for (const a of document.querySelectorAll('a[href*="/review/"]')) {
      if (!/#\d{2,}/.test(a.textContent)) continue;
      const p = GBL.parse(GBL.absolute(a.getAttribute("href")));
      if (p && p.surface === "linearReview")
        byHash.set(p.hash, { workspace: p.workspace, slug: p.slug, hash: p.hash });
    }
    return byHash.size === 1 ? { linearReview: [...byHash.values()][0] } : {};
  }

  // Graphite renders the PR description AND the discussion (including Linear's own integration
  // comment) client-side, so the Linear edges are on the page — but so is noise: any comment may
  // mention an unrelated issue (a bot cited SCAPP-697 on a PR whose issue is SCAPP-1323). We can't
  // scope to the description/comment containers the way we do on GitHub — Graphite's classes are
  // hashed CSS modules (`Description_description__8QGFC`) that churn on deploy — so instead we
  // collect every candidate and rank them by class-free signals, staying quiet when none of them
  // picks a winner (the same 1:many guard scrapeLinearIssue uses).
  function scrapeGraphite() {
    const obs = {};
    const issues = [];
    const reviews = new Map();
    for (const a of document.querySelectorAll('a[href*="linear.app"]')) {
      const p = GBL.parse(GBL.absolute(a.getAttribute("href")));
      if (!p) continue;
      if (p.surface === "linearReview") {
        reviews.set(p.hash, { workspace: p.workspace, slug: p.slug, hash: p.hash });
      } else if (p.surface === "linearIssue") {
        // Linear's integration comment renders the PR's issue as a chip captioned with the id AND
        // its title ("SCAPP-1323 Upward KYC BE"). Requiring the title is what separates it from the
        // two weaker forms: a bot citation (title only, e.g. "Card Optimization: GET…") and an
        // inline mention Linear auto-links to a bare id ("SCAPP-1345"), both of which point at
        // related-but-different issues. Verified on elevate#10376 and #10377.
        const chip = new RegExp("^" + p.issueId + "\\s+\\S", "i").test((a.textContent || "").trim());
        issues.push({ workspace: p.workspace, issueId: p.issueId, slug: p.slug || null, chip });
      }
    }
    if (reviews.size === 1) obs.linearReview = [...reviews.values()][0];
    const issue = pickGraphiteIssue(issues);
    if (issue) obs.linearIssue = issue;
    return obs;
  }

  // Rank the Linear-issue candidates found on a Graphite page. Each tier must agree on a single
  // issue id to win; within a tier we prefer a link that carries the slug (nicer URL to rebuild).
  function pickGraphiteIssue(cands) {
    if (!cands.length) return null;
    const oneId = (l) => l.length && l.every((c) => c.issueId === l[0].issueId);
    const best = (l) => l.find((c) => c.slug) || l[0];
    const chips = cands.filter((c) => c.chip);
    if (oneId(chips)) return best(chips); // 1. Linear's own integration chip
    const title = (document.title || "").toUpperCase();
    const titled = cands.filter((c) => title.includes(c.issueId));
    if (oneId(titled)) return best(titled); // 2. id in the PR title, e.g. "…(SCAPP-1323) #10376"
    if (oneId(cands)) return best(cands); // 3. every link on the page agrees
    return null; // ambiguous — write nothing, let memory decide
  }

  // buildObservation: the self identifiers from the URL + whatever we can scrape now.
  function buildObservation(parsed) {
    const obs = { source: parsed.surface };
    if (parsed.surface === "github" || parsed.surface === "graphite") {
      obs.pr = { org: parsed.org, repo: parsed.repo, prNumber: parsed.prNumber };
      Object.assign(obs, parsed.surface === "github" ? scrapeGithub() : scrapeGraphite());
    } else if (parsed.surface === "linearReview") {
      obs.linearReview = { workspace: parsed.workspace, slug: parsed.slug, hash: parsed.hash };
      Object.assign(obs, scrapeLinearReview());
    } else if (parsed.surface === "linearIssue") {
      obs.linearIssue = { workspace: parsed.workspace, issueId: parsed.issueId, slug: parsed.slug };
      Object.assign(obs, scrapeLinearIssue());
    }
    return obs;
  }

  function isEmptyObs(obs) {
    return !obs.pr && !obs.linearIssue && !obs.linearReview;
  }

  // --- record resolution ----------------------------------------------------------------

  // Ask the service worker to merge the observation into the persistent map and return the
  // canonical record. Falls back to a current-page-only record if the SW can't be reached.
  function getRecord(observation) {
    const local = {
      linearIssue: observation.linearIssue || null,
      linearReviews: observation.linearReview
        ? [{ ...observation.linearReview, pr: observation.pr || null }]
        : [],
      prs: observation.pr ? [observation.pr] : [],
    };
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "observe", observation }, (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.record) return resolve(local);
          resolve(resp.record);
        });
      } catch (e) {
        resolve(local);
      }
    });
  }

  // An item (one Linear issue) can carry several PRs, each with its own review. Each review
  // entry records its PR (`pr`, see store.js addReview), so the PR surfaces and the review
  // surface resolve each other by that pairing. Recency (the array's last entry) is only the
  // fallback for the Linear Issue page and for pairings not observed yet.
  const samePr = (a, b) =>
    !!a && !!b && a.org === b.org && a.repo === b.repo && a.prNumber === b.prNumber;
  const isPrSurface = (parsed) => parsed.surface === "github" || parsed.surface === "graphite";
  const last = (l) => l[l.length - 1];

  function currentReview(record, parsed) {
    if (parsed.surface !== "linearReview" || !record || !record.linearReviews) return null;
    return record.linearReviews.find((r) => r.hash === parsed.hash) || null;
  }

  function pickPr(record, parsed) {
    if (!record || !record.prs || !record.prs.length) return null;
    const want = isPrSurface(parsed) ? parsed : (currentReview(record, parsed) || {}).pr;
    if (want) {
      const m = record.prs.find((p) => samePr(p, want));
      if (m) return m;
    }
    return last(record.prs);
  }

  function pickReview(record, parsed) {
    if (!record || !record.linearReviews || !record.linearReviews.length) return null;
    const revs = record.linearReviews;
    if (parsed.surface === "linearReview") return currentReview(record, parsed) || last(revs);
    if (isPrSurface(parsed)) {
      const mine = revs.filter((r) => samePr(r.pr, parsed));
      if (mine.length) return last(mine);
      // Never link to a review known to belong to a different PR.
      const unpaired = revs.filter((r) => !r.pr);
      return unpaired.length ? last(unpaired) : null;
    }
    return last(revs);
  }

  // True once the PR ↔ review choice is backed by an observed pairing (or there is nothing to
  // choose between) — until then tick() keeps re-scraping rather than settling on a guess.
  function pairingSettled(record, parsed) {
    if (parsed.surface === "linearReview") {
      const r = currentReview(record, parsed);
      return !!(r && r.pr) || record.prs.length <= 1;
    }
    if (isPrSurface(parsed)) {
      const revs = record.linearReviews;
      return revs.some((r) => samePr(r.pr, parsed)) || revs.length <= 1;
    }
    return true;
  }

  function resolveLinks(parsed, record) {
    const pr = pickPr(record, parsed);
    return {
      github: GBL.buildGithub(pr),
      graphite: GBL.buildGraphite(pr),
      linearIssue: GBL.buildLinearIssue(record && record.linearIssue),
      linearReview: GBL.buildLinearReview(pickReview(record, parsed)),
    };
  }

  // --- rendering ------------------------------------------------------------------------

  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (host && host.__gblRoot) return host;
    host = document.createElement("div");
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = GBL.STYLES;
    root.appendChild(style);
    const wrap = document.createElement("div");
    wrap.className = "gbl-wrap";
    const bar = document.createElement("div");
    bar.className = "gbl-bar";
    const handle = document.createElement("div");
    handle.className = "gbl-handle";
    handle.addEventListener("click", () => setCollapsed(false));
    wrap.appendChild(bar);
    wrap.appendChild(handle);
    root.appendChild(wrap);
    (document.documentElement || document.body).appendChild(host);
    host.__gblRoot = root;
    host.__gblWrap = wrap;
    host.__gblBar = bar;
    host.__gblHandle = handle;
    return host;
  }

  function seg(surface, { current, url }) {
    const el = document.createElement(url && !current ? "a" : "span");
    el.className = "seg" + (current ? " cur" : url ? " link" : " disabled");
    el.style.setProperty("--c", surface.color);
    if (url && !current) {
      el.href = url;
      el.rel = "noopener";
    }
    if (!url && !current) el.title = `No linked ${surface.label} found yet`;
    const dot = document.createElement("span");
    dot.className = "dot";
    el.appendChild(dot);
    el.appendChild(document.createTextNode(surface.label));
    return el;
  }

  function renderBar(parsed, links, prNumber, linearIssue) {
    const host = ensureHost();
    const bar = host.__gblBar;
    const handle = host.__gblHandle;
    const current = GBL.SURFACES.find((s) => s.key === parsed.surface);
    host.__gblWrap.style.setProperty("--accent", current ? current.color : "#444");
    host.__gblWrap.classList.toggle("collapsed", collapsed);

    bar.textContent = "";
    const brand = document.createElement("span");
    brand.className = "brand";
    brand.textContent = "graptilubear";
    bar.appendChild(brand);

    const issueId = linearIssue && linearIssue.issueId;
    if (issueId || prNumber) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent =
        issueId && prNumber ? `${issueId} → #${prNumber}` : issueId || `#${prNumber}`;
      bar.appendChild(badge);
    }

    for (const s of GBL.SURFACES) {
      bar.appendChild(seg(s, { current: s.key === parsed.surface, url: links[s.key] }));
    }

    const btn = document.createElement("button");
    btn.className = "collapse";
    btn.title = "Hide bar";
    btn.textContent = "×";
    btn.addEventListener("click", () => setCollapsed(true));
    bar.appendChild(btn);

    // collapsed handle reflects the current surface
    handle.textContent = "";
    const hdot = document.createElement("span");
    hdot.className = "dot";
    handle.appendChild(hdot);
    handle.appendChild(document.createTextNode(current ? current.label : "graptilubear"));

    applyPush(collapsed ? 0 : BAR_HEIGHT);
  }

  function removeHost() {
    const host = document.getElementById(HOST_ID);
    if (host) host.remove();
    applyPush(0); // not on a surface — release the reserved space
  }

  function setCollapsed(v) {
    collapsed = v;
    const host = document.getElementById(HOST_ID);
    if (host && host.__gblWrap) host.__gblWrap.classList.toggle("collapsed", collapsed);
    applyPush(collapsed ? 0 : BAR_HEIGHT); // collapsed = small handle only, reclaim the space
    try {
      chrome.storage.local.set({ [COLLAPSE_KEY]: v });
    } catch (e) {}
  }

  // --- the tick loop --------------------------------------------------------------------

  async function tick() {
    const url = location.href;
    const parsed = GBL.parse(url);
    // Every tick, ahead of the early returns below, so it self-heals if the site rewrites <head>.
    if (GBL.applyFavicon) GBL.applyFavicon(parsed ? parsed.surface : null);
    if (!parsed) {
      removeHost();
      lastUrl = null;
      return;
    }
    const urlChanged = url !== lastUrl;
    if (urlChanged) {
      lastUrl = url;
      attempts = 0;
    }
    // Re-scrape on later ticks only while links may still be incomplete.
    const haveBar = !!document.getElementById(HOST_ID);
    if (!urlChanged && haveBar && attempts >= SCRAPE_RETRY_MAX) return;
    attempts++;

    const observation = buildObservation(parsed);
    if (isEmptyObs(observation)) {
      // shouldn't happen (self is always present), but guard anyway
      return;
    }
    const record = await getRecord(observation);
    if (location.href !== url) return; // navigated away mid-await
    const links = resolveLinks(parsed, record);
    const pr = pickPr(record, parsed);

    // stop retrying once everything resolves
    if (
      links.github &&
      links.graphite &&
      links.linearIssue &&
      links.linearReview &&
      pairingSettled(record, parsed)
    ) {
      attempts = SCRAPE_RETRY_MAX;
    }
    renderBar(parsed, links, pr ? pr.prNumber : null, record && record.linearIssue);
  }

  // --- bootstrap ------------------------------------------------------------------------

  function start() {
    try {
      chrome.storage.local.get(COLLAPSE_KEY, (o) => {
        collapsed = !!(o && o[COLLAPSE_KEY]);
        tick();
      });
    } catch (e) {
      tick();
    }
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "route") tick();
    });
    setInterval(tick, 700);
    window.addEventListener("pageshow", tick);
    // Re-capture the scroll offset for the Primer dialog fix right before a dialog could open
    // (capture phase, so it runs ahead of the site's own handlers).
    const refreshOverlayFix = () => {
      if (pushedPx > 0) applyOverlayFix(pushedPx);
    };
    document.addEventListener("click", refreshOverlayFix, true);
    document.addEventListener("keydown", refreshOverlayFix, true);
    // Graphite renders nothing while the tab is hidden (React defers the whole PR view), so a
    // background-opened tab burns its whole SCRAPE_RETRY_MAX budget on an empty DOM and has given
    // up by the time the user looks at it. Becoming visible earns a fresh budget.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      attempts = 0;
      tick();
    });
  }

  start();
})();
