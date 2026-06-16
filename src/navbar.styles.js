// navbar.styles.js — the shadow-root stylesheet as a string on GBL.STYLES.
// Injected as a <style> element created via the DOM API (survives strict host CSP).
// Classic content script; attaches to the shared GBL global.

(function () {
  "use strict";
  const GBL = (globalThis.GBL = globalThis.GBL || {});

  GBL.STYLES = `
  :host {
    all: initial;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2147483647;
    display: block;
    color-scheme: dark;
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 12px;
    line-height: 1;
  }

  .gbl-wrap { box-sizing: border-box; }

  .gbl-bar {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 10px;
    background: #16181d;
    border-bottom: 2px solid var(--accent, #444);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
    color: #c9d1d9;
    user-select: none;
  }
  .gbl-wrap.collapsed .gbl-bar { display: none; }

  .brand {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: lowercase;
    color: var(--accent, #8b949e);
    margin-right: 4px;
    flex-shrink: 0;
  }

  .seg {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 6px;
    text-decoration: none;
    color: #c9d1d9;
    font-weight: 500;
    white-space: nowrap;
    cursor: default;
  }
  .seg .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c, #888);
    flex-shrink: 0;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
  }

  a.seg.link { cursor: pointer; }
  a.seg.link:hover { background: rgba(255, 255, 255, 0.09); color: #fff; }

  .seg.cur {
    background: var(--c, #444);
    color: #fff;
    font-weight: 700;
  }
  .seg.cur .dot {
    background: #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  }
  .seg.cur .here {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.9;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 999px;
    padding: 1px 5px;
    margin-left: 2px;
  }

  .seg.disabled {
    color: #6b727c;
    opacity: 0.6;
  }
  .seg.disabled .dot { opacity: 0.45; }

  .collapse {
    margin-left: auto;
    background: transparent;
    border: none;
    color: #8b949e;
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    padding: 4px 7px;
    border-radius: 5px;
    flex-shrink: 0;
  }
  .collapse:hover { background: rgba(255, 255, 255, 0.09); color: #fff; }

  /* collapsed: a small color-coded tab pinned top-right */
  .gbl-handle {
    display: none;
    position: fixed;
    top: 0;
    right: 16px;
    align-items: center;
    gap: 6px;
    height: 20px;
    padding: 0 10px;
    background: var(--accent, #444);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.03em;
    border-radius: 0 0 6px 6px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
    cursor: pointer;
  }
  .gbl-wrap.collapsed .gbl-handle { display: inline-flex; }
  .gbl-handle .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #fff;
  }
  `;
})();
