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

  let collapsed = false;
  let lastUrl = null;
  let attempts = 0;

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

  function scrapeLinearReview() {
    const obs = {};
    const gh = document.querySelector('a[href*="github.com"][href*="/pull/"]');
    if (gh) {
      const p = GBL.parse(GBL.absolute(gh.getAttribute("href")));
      if (p && p.surface === "github") obs.pr = { org: p.org, repo: p.repo, prNumber: p.prNumber };
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

  // buildObservation: the self identifiers from the URL + whatever we can scrape now.
  function buildObservation(parsed) {
    const obs = {};
    if (parsed.surface === "github" || parsed.surface === "graphite") {
      obs.pr = { org: parsed.org, repo: parsed.repo, prNumber: parsed.prNumber };
      if (parsed.surface === "github") Object.assign(obs, scrapeGithub());
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
      linearReviews: observation.linearReview ? [observation.linearReview] : [],
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

  function pickPr(record, parsed) {
    if (!record || !record.prs || !record.prs.length) return null;
    if (parsed.surface === "github" || parsed.surface === "graphite") {
      const m = record.prs.find(
        (p) => p.org === parsed.org && p.repo === parsed.repo && p.prNumber === parsed.prNumber
      );
      if (m) return m;
    }
    return record.prs[record.prs.length - 1];
  }

  function pickReview(record, parsed) {
    if (!record || !record.linearReviews || !record.linearReviews.length) return null;
    if (parsed.surface === "linearReview") {
      const m = record.linearReviews.find((r) => r.hash === parsed.hash);
      if (m) return m;
    }
    return record.linearReviews[record.linearReviews.length - 1];
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
    if (current) {
      const here = document.createElement("span");
      here.className = "here";
      here.textContent = "you are here";
      el.appendChild(here);
    }
    return el;
  }

  function renderBar(parsed, links) {
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
  }

  function removeHost() {
    const host = document.getElementById(HOST_ID);
    if (host) host.remove();
  }

  function setCollapsed(v) {
    collapsed = v;
    const host = document.getElementById(HOST_ID);
    if (host && host.__gblWrap) host.__gblWrap.classList.toggle("collapsed", collapsed);
    try {
      chrome.storage.local.set({ [COLLAPSE_KEY]: v });
    } catch (e) {}
  }

  // --- the tick loop --------------------------------------------------------------------

  async function tick() {
    const url = location.href;
    const parsed = GBL.parse(url);
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

    // stop retrying once everything resolves
    if (links.github && links.graphite && links.linearIssue && links.linearReview) {
      attempts = SCRAPE_RETRY_MAX;
    }
    renderBar(parsed, links);
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
  }

  start();
})();
