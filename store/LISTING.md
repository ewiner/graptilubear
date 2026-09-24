# Chrome Web Store listing

Copy for the Developer Dashboard fields. Keep in sync with the extension's behavior.

## Store listing tab

**Name:** graptilubear (from manifest)

**Summary** (manifest `description`, max 132 chars):
Color-coded sticky navbar to jump between the GitHub PR, Graphite PR, Linear Issue, and Linear Review pages for one piece of work.

**Category:** Developer Tools

**Language:** English

**Description:**

```
If your team reviews code across GitHub, Graphite, and Linear, one piece of work lives on four
pages that look almost the same: the GitHub PR, the Graphite PR, the Linear issue, and the
Linear review. graptilubear adds a thin color-coded bar to the top of each so you can see which
one you're on and jump to the others in one click.

• GitHub PR (green), Graphite PR (orange), Linear Issue (indigo), Linear Review (teal)
• The current page is highlighted; pages it can't find yet are greyed out
• GitHub ↔ Graphite links come straight from the URL
• Linear links are picked up from the pages you visit and remembered, so once you've seen them
  together they resolve from any of the four
• A badge shows the issue ID and PR number (e.g. ABC-123 → #456)
• Graphite and Linear tab icons are tinted in the same colors so the tabs are easy to tell apart
• Collapse the bar to a small corner tab with ×

Everything stays in your browser. No account, no server, no analytics.

Source: https://github.com/ewiner/graptilubear
```

**Graphic assets** (generated from `store/promo.html` by `store/render.sh`; the navbar in them
is rendered from the shipped `GBL.STYLES`, the pages under it are mocks with fake data):

| Asset | Size | File |
|---|---|---|
| Store icon | 128×128 | `icons/icon128.png` (source: `store/icon.svg`) |
| Screenshots | 1280×800 | `store/screenshots/1-hero.png` … `4-how.png` |
| Small promo tile (required) | 440×280 | `store/screenshots/promo-small-440x280.png` |
| Marquee promo tile (optional) | 1400×560 | `store/screenshots/promo-marquee-1400x560.png` |

**Homepage URL:** https://github.com/ewiner/graptilubear
**Support URL:** https://github.com/ewiner/graptilubear/issues

## Privacy practices tab

**Single purpose:**
Adds a navigation bar to GitHub, Graphite, and Linear pull request / issue pages that links
between the corresponding pages for the same piece of work.

**Permission justifications:**

- `storage` — Remembers which GitHub PR, Graphite PR, Linear issue, and Linear review belong
  together, so links learned on one page are available on the others. Also remembers whether
  the bar is collapsed. Stored locally only.
- `webNavigation` — GitHub, Graphite, and Linear are single-page apps that change the URL without
  reloading. The service worker listens for these history updates on those three sites so the
  bar can re-render for the new page.
- Host permissions (`github.com`, `app.graphite.com`, `linear.app`) — The content script injects
  the navbar on these sites and reads the page URL and relevant links (Linear links on GitHub,
  the GitHub PR link on Linear reviews). It must match the whole site, not just PR paths,
  because in-app navigation can move from any page to a PR page without a reload.

**Remote code:** No, I am not using remote code.

**Data usage:** Check none of the collection boxes — no data is transmitted off the device.
(The extension reads URLs and links on the three sites, but only stores them locally; per the
CWS definition, data that never leaves the device isn't "collected".)
Certify all three disclosures (no selling, no unrelated use, no creditworthiness).

**Privacy policy URL:** https://github.com/ewiner/graptilubear/blob/main/PRIVACY.md

## Distribution tab

Visibility: Public or Unlisted. Regions: all.
