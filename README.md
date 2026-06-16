# graptilubear

A personal Chrome extension (Manifest V3) that adds a **sticky, color-coded top navbar**
to the four web surfaces involved in reviewing one piece of work — so you always know
*which* tool you're looking at and can jump to the corresponding page on the others in one
click.

The four surfaces:

| Surface | URL shape | Accent |
|---|---|---|
| **GitHub PR** | `github.com/{org}/{repo}/pull/{prNumber}` | charcoal |
| **Graphite PR** | `app.graphite.com/github/pr/{org}/{repo}/{prNumber}/{slug}` | coral |
| **Linear Issue** | `linear.app/{workspace}/issue/{ISSUE-ID}/{slug}` | indigo |
| **Linear Review** | `linear.app/{workspace}/review/{slug}-{hash}/review` | teal |

They aren't always 1:1 with each other, so the navbar resolves as many of the four as it
can and disables the rest (with a tooltip). The current surface is highlighted in its accent
color — the "you are here" cue is the core value, since all four sites look alike.

## How the linking works

- **GitHub ↔ Graphite** is deterministic — the `{org}/{repo}/{prNumber}` triple is embedded
  in both URLs, so those links are *constructed*, never scraped.
- **Linear** links are discovered by scraping the page (Linear's GitHub bot-comment links on
  GitHub; the GitHub anchor + issue breadcrumb on a Linear review page; the review attachment
  on a Linear issue page) and then **remembered** in `chrome.storage.local`. So once you've
  visited a "complete" surface (a GitHub PR or a Linear review) for a given work item, the
  link resolves from *any* of the four surfaces afterward — even the ones that don't show it.

See [CLAUDE.md](CLAUDE.md) for the full architecture and the (fragile) scraping selectors.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Open a GitHub PR, a Graphite PR, or a Linear issue/review page — the bar appears at the top.

After editing the code: hit the **reload** button on the extension card in `chrome://extensions`
(reloads the service worker), then reload the page tab (to re-inject the content script).

## Status

Work in progress. No build step — it's plain vanilla JS, loaded directly.
