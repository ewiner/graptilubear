// popup.js — tiny control panel: show how many work items are remembered, clear the memory,
// and force the bar on the active tab to re-render.

const KEY = "gbl.v1";
const countEl = document.getElementById("count");

function refresh() {
  chrome.storage.local.get(KEY, (o) => {
    const db = o[KEY];
    countEl.textContent = db && db.items ? Object.keys(db.items).length : 0;
  });
}

document.getElementById("clear").addEventListener("click", () => {
  chrome.storage.local.remove(KEY, refresh);
});

document.getElementById("reload").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (tab) chrome.tabs.sendMessage(tab.id, { type: "route", url: tab.url }).catch(() => {});
    window.close();
  });
});

refresh();
