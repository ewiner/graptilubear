# graptilubear privacy policy

_Last updated: 2026-09-24_

graptilubear does not collect, transmit, sell, or share any data. It has no server, no
analytics, and makes no network requests of its own.

## What it reads

On `github.com`, `app.graphite.com`, and `linear.app` pages only, the extension reads the page
URL and a few links on the page (links to Linear issues/reviews and GitHub pull requests) to
work out which GitHub PR, Graphite PR, Linear issue, and Linear review belong together.

## What it stores

It saves those associations in `chrome.storage.local`, on your device only:

- GitHub org, repo, and PR number (and the Graphite URL slug)
- Linear workspace, issue ID, issue URL slug, and review URL slug/hash
- the time each association was last updated
- whether you collapsed the navbar

Nothing leaves your browser. Chrome sync is not used.

## Deleting it

Click the extension's toolbar icon → **Clear memory**, or uninstall the extension. Either
removes everything it stored.

## Contact

Open an issue at <https://github.com/ewiner/graptilubear/issues>.
