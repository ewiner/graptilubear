// background.js — service worker. Owns SPA route detection: GitHub (Turbo), Linear, and
// Graphite mutate the URL without a full navigation, so the one-shot content script needs a
// nudge to re-render. On any in-page navigation to one of our origins, ping the tab's
// content script to re-run its tick().
//
// (Persistent association memory is layered on in store.js — see the `observe` handler.)

const ORIGIN_FILTER = {
  url: [
    { hostEquals: "github.com" },
    { hostEquals: "app.graphite.com" },
    { hostEquals: "linear.app" },
  ],
};

function pingTab(details) {
  if (details.frameId !== 0) return;
  chrome.tabs.sendMessage(details.tabId, { type: "route", url: details.url }).catch(() => {});
}

chrome.webNavigation.onHistoryStateUpdated.addListener(pingTab, ORIGIN_FILTER);
chrome.webNavigation.onCommitted.addListener(pingTab, ORIGIN_FILTER);

// Without persistence yet, turn an observation straight into a record shape so the content
// script's resolution path works the same as it will once memory lands.
function observationToRecord(obs) {
  return {
    linearIssue: obs.linearIssue || null,
    linearReviews: obs.linearReview ? [obs.linearReview] : [],
    prs: obs.pr ? [obs.pr] : [],
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "observe") {
    sendResponse({ record: observationToRecord(msg.observation || {}) });
    return false;
  }
});
