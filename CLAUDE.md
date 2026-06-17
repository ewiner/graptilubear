# CLAUDE.md — graptilubear

Cross-tool PR navigator: a Manifest V3 Chrome extension that injects a color-coded sticky
navbar on GitHub PR, Graphite PR, Linear Issue, and Linear Review pages, with one-click jumps
between the corresponding pages.

## Hard rules

- **No build step. Vanilla JS, MV3, loaded unpacked. Do not add a bundler / TypeScript / npm.**
- **GitHub ↔ Graphite links are pure URL construction. NEVER scrape for them.** The
  `{org}/{repo}/{prNumber}` triple is in both URLs.
- **Constructed Graphite URLs append `?mode=tour`.**
- **Never scrape Linear by CSS class** — its classes are obfuscated styled-components (`sx-…`).
  Scrape by `href` pattern + visible text, scoped to the relevant widget.

## URL grammars (the `surfaces.js` core)

| Surface key | URL | Identifiers (deterministic) |
|---|---|---|
| `github` | `github.com/{org}/{repo}/pull/{pr}` | org, repo, prNumber |
| `graphite` | `app.graphite.com/github/pr/{org}/{repo}/{pr}/{slug}?mode=tour` | org, repo, prNumber |
| `linearIssue` | `linear.app/{workspace}/issue/{ISSUE-ID}/{slug}` | workspace, issueId, slug |
| `linearReview` | `linear.app/{workspace}/review/{slug}-{hash}/review` | workspace, slug, hash |

Strip query/hash before parsing. The Linear-review hash is the trailing `[0-9a-f]{8,}` segment.

## Architecture contract

- **Service worker (`background.js`) owns route detection** via `chrome.webNavigation`
  (`onHistoryStateUpdated` + `onCommitted`, frame 0, filtered to the 3 origins). On a match it
  sends `{type:'route', url}` to the tab. It also serializes all writes to the association map.
- **`content.js` render is idempotent.** `tick()` may be called repeatedly (initial load, route
  message, ~0.7s self-healing interval, `pageshow`). It diffs against the last-rendered URL and
  updates the existing navbar host in place; it never stacks duplicate bars. Guard bfcache with a
  known host-element id.
- Service worker is **ephemeral** — keep no state in SW memory; the map lives only in
  `chrome.storage.local`. Listeners re-register at SW top level on wake.
- **File worlds:** `surfaces.js` + `navbar.styles.js` + `content.js` are classic content scripts
  (shared isolated-world scope; they attach to a `GBL` global, no `import`/`export`). `store.js` is
  an ES module imported by `background.js` (`"type":"module"`). Don't mix the two worlds in one file.
- **Font goes on `.gbl-wrap` (a shadow element), NEVER on `:host`.** The host is in the page's light
  DOM, so the site's CSS overrides `:host` and children inherit the page font (Linear → Times). A
  rule inside the shadow tree is immune. `.gbl-wrap *{font-family:inherit}` makes the `<button>`
  match too (buttons don't inherit font by default).
- **Page push:** space is reserved by `transform: translateY(BAR_HEIGHT)` on `<body>` (a transform
  makes body the containing block for the site's own `position:fixed` headers, so they move down
  too — margin/padding wouldn't). The host is on `<html>`, so it stays in the gap. Cleared when
  collapsed or off a surface. `BAR_HEIGHT` (content.js) must stay in sync with `.gbl-bar` height +
  border in navbar.styles.js.

## Storage schema (`store.js`)

```
{ schemaVersion: 1,
  items: { "<id>": { id, linearIssue:{workspace,issueId,slug}|null,
                     linearReviews:[{workspace,slug,hash}], prs:[{org,repo,prNumber,graphiteSlug|null}],
                     updatedAt } },
  index: { byPr:{"org/repo#pr":id}, byIssue:{"workspace/ISSUE-ID":id}, byReview:{"workspace/hash":id} } }
```

- Indices store **ids only**. **Ids never change once assigned** — enrich a record, never re-key it.
- `prs` / `linearReviews` are arrays → handle stacked PRs / multiple reviews per issue.
- `mergeObservation`: 0 index matches → create; 1 → field-merge (union arrays, fill nulls); 2+ →
  two records are the same item, merge into the oldest id and repoint the losers' index entries.

## Fragile selectors (one place to fix when a site redesigns)

These were verified live (logged in) on PR #456 / ABC-123. If a button stops resolving, check here.

- **GitHub PR page** — Linear links: `.comment-body a[href*="linear.app"]`, classified by URL path
  (`/issue/` vs `/review/`). PR title: `.js-issue-title`. ⚠ Only present on the **conversation tab**
  (not `/files`, `/checks`) — memory covers those. Graphite link is CONSTRUCTED (the page lists the
  whole stack, which is noisy).
- **Linear review page** — GitHub PR: `a[href*="github.com"][href*="/pull/"]`. Issue breadcrumb:
  `a[href*="/issue/"]`.
- **Linear issue page** — issue id from URL / `document.title`. PR attachments are `a[href*="/review/"]`
  anchors whose subtree text shows a PR `#<number>`. ⚠ An issue can link **many** PRs (ABC-123 links
  13), so we only remember the review when there is **exactly one** attachment; with several we write
  nothing and let memory recency pick the most-recently-visited PR. The issue page never exposes
  org/repo, so GitHub/Graphite always resolve via memory here.
- **Graphite page** — triple from URL only (DOM not inspected; the dev tooling blocks the domain).
  Linear edges rely on memory.

## Surface accent colors

GitHub `#2da44e` (green) · Graphite `#ff5f3a` · Linear Issue `#5e6ad2` · Linear Review `#26b5a8`.
A `.badge` pill right after the brand shows the resolved identifiers: `ISSUE-ID → #PR` when
both are known, or just the issue id / just `#PR` when only one is.

## Reload after edits

`chrome://extensions` → reload the extension card (reloads SW) → reload the page tab (re-injects
content scripts). Inspect storage in the SW devtools console: `chrome.storage.local.get(console.log)`.
