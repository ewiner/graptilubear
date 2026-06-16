// background.js — service worker. Two jobs:
//  1. SPA route detection: GitHub (Turbo), Linear, and Graphite mutate the URL without a full
//     navigation, so the one-shot content script needs a nudge to re-render.
//  2. Serialize writes to the persistent association map (store.js) so concurrent tabs don't
//     clobber each other.
// The SW is ephemeral — it holds no state; everything lives in chrome.storage.local.

import { handleObserve } from "./store.js";

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

// Serialize all map writes through one promise chain (chrome.storage has no transactions, and
// two tabs can fire `observe` at once). Each observe does read → merge → write atomically
// relative to the others, then replies with the merged canonical record.
let writeChain = Promise.resolve();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "observe") {
    writeChain = writeChain
      .then(() => handleObserve(msg.observation || {}))
      .then((record) => sendResponse({ record }))
      .catch((err) => {
        console.error("[graptilubear] observe failed:", err);
        sendResponse({ record: null });
      });
    return true; // keep the message channel open for the async sendResponse
  }
});
