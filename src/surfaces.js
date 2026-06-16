// surfaces.js — the deterministic core: parse the 4 URL grammars and build links.
//
// Loaded as a CLASSIC content script (no import/export). It attaches everything to a
// shared `GBL` global so the other content scripts (navbar.styles.js, content.js) can use it.
// See CLAUDE.md "File worlds".

(function () {
  "use strict";
  const GBL = (globalThis.GBL = globalThis.GBL || {});

  // The four surfaces, in fixed display order. Keep `key` in sync with parse() below and
  // with the storage/record fields. Colors are the "you are here" accents.
  const SURFACES = [
    { key: "linearIssue", label: "Linear Issue", color: "#5e6ad2" },
    { key: "github", label: "GitHub PR", color: "#1f2328" },
    { key: "graphite", label: "Graphite", color: "#ff5f3a" },
    { key: "linearReview", label: "Linear Review", color: "#26b5a8" },
  ];

  const RX = {
    github: /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
    graphite: /^https?:\/\/app\.graphite\.com\/github\/pr\/([^/]+)\/([^/]+)\/(\d+)/,
    // capture optional slug after the issue id
    linearIssue: /^https?:\/\/linear\.app\/([^/]+)\/issue\/([A-Za-z]+-\d+)(?:\/([^/?#]+))?/,
    // slug is greedy so the trailing [0-9a-f]{8,} segment is taken as the hash
    linearReview: /^https?:\/\/linear\.app\/([^/]+)\/review\/(.+)-([0-9a-f]{8,})(?:\/|[?#]|$)/,
  };

  // parse(url) -> { surface, ...identifiers } | null
  function parse(url) {
    if (!url) return null;
    let m;
    if ((m = RX.github.exec(url)))
      return { surface: "github", org: m[1], repo: m[2], prNumber: Number(m[3]) };
    if ((m = RX.graphite.exec(url)))
      return { surface: "graphite", org: m[1], repo: m[2], prNumber: Number(m[3]) };
    if ((m = RX.linearReview.exec(url)))
      return { surface: "linearReview", workspace: m[1], slug: m[2], hash: m[3] };
    if ((m = RX.linearIssue.exec(url)))
      return {
        surface: "linearIssue",
        workspace: m[1],
        issueId: m[2].toUpperCase(),
        slug: m[3] || null,
      };
    return null;
  }

  // Resolve a possibly-relative href against the current origin, returning an absolute URL
  // string (or null on failure). Used when scraping anchors that may be path-only.
  function absolute(href, base) {
    try {
      return new URL(href, base || (typeof location !== "undefined" ? location.href : undefined)).href;
    } catch (e) {
      return null;
    }
  }

  // --- builders: given the stored identifiers, construct each surface's URL --------------

  function buildGithub(pr) {
    return pr ? `https://github.com/${pr.org}/${pr.repo}/pull/${pr.prNumber}` : null;
  }

  function buildGraphite(pr) {
    if (!pr) return null;
    const slug = pr.graphiteSlug ? `/${pr.graphiteSlug}` : "";
    return `https://app.graphite.com/github/pr/${pr.org}/${pr.repo}/${pr.prNumber}${slug}?mode=tour`;
  }

  function buildLinearIssue(li) {
    if (!li) return null;
    const slug = li.slug ? `/${li.slug}` : "";
    return `https://linear.app/${li.workspace}/issue/${li.issueId}${slug}`;
  }

  function buildLinearReview(lr) {
    if (!lr) return null;
    return `https://linear.app/${lr.workspace}/review/${lr.slug}-${lr.hash}/review`;
  }

  GBL.SURFACES = SURFACES;
  GBL.parse = parse;
  GBL.absolute = absolute;
  GBL.buildGithub = buildGithub;
  GBL.buildGraphite = buildGraphite;
  GBL.buildLinearIssue = buildLinearIssue;
  GBL.buildLinearReview = buildLinearReview;
})();
