// store.js — persistent association memory (ES module, imported by background.js).
//
// One canonical record per work item + id-only indices. Visiting any surface enriches the
// record so the weak surfaces (Linear issue page, Graphite) can resolve links they don't
// themselves expose. See CLAUDE.md "Storage schema".

const KEY = "gbl.v1";

function emptyDb() {
  return { schemaVersion: 1, items: {}, index: { byPr: {}, byIssue: {}, byReview: {} } };
}

async function load() {
  const o = await chrome.storage.local.get(KEY);
  const db = o[KEY];
  if (!db || db.schemaVersion !== 1) return emptyDb();
  return db;
}

async function save(db) {
  await chrome.storage.local.set({ [KEY]: db });
}

const prKey = (p) => `${p.org}/${p.repo}#${p.prNumber}`;
const issueKey = (li) => `${li.workspace}/${li.issueId}`;
const reviewKey = (lr) => `${lr.workspace}/${lr.hash}`;

function newId(obs) {
  if (obs.linearIssue) return "iss:" + issueKey(obs.linearIssue);
  if (obs.pr) return "gh:" + prKey(obs.pr);
  if (obs.linearReview) return "rev:" + reviewKey(obs.linearReview);
  return "x:" + Date.now();
}

function indexLookup(db, obs) {
  const ids = new Set();
  if (obs.pr && db.index.byPr[prKey(obs.pr)]) ids.add(db.index.byPr[prKey(obs.pr)]);
  if (obs.linearIssue && db.index.byIssue[issueKey(obs.linearIssue)])
    ids.add(db.index.byIssue[issueKey(obs.linearIssue)]);
  if (obs.linearReview && db.index.byReview[reviewKey(obs.linearReview)])
    ids.add(db.index.byReview[reviewKey(obs.linearReview)]);
  // only keep ids that still point at a live record
  return [...ids].filter((id) => db.items[id]);
}

const samePr = (a, b) => a.org === b.org && a.repo === b.repo && a.prNumber === b.prNumber;
const sameReview = (a, b) => a.workspace === b.workspace && a.hash === b.hash;

function addPr(item, pr) {
  const e = item.prs.find((p) => samePr(p, pr));
  if (!e) item.prs.push({ org: pr.org, repo: pr.repo, prNumber: pr.prNumber, graphiteSlug: pr.graphiteSlug || null });
  else if (pr.graphiteSlug && !e.graphiteSlug) e.graphiteSlug = pr.graphiteSlug;
}

function addReview(item, lr) {
  const e = item.linearReviews.find((r) => sameReview(r, lr));
  if (!e) item.linearReviews.push({ workspace: lr.workspace, slug: lr.slug, hash: lr.hash });
  else if (lr.slug && !e.slug) e.slug = lr.slug;
}

function setIssue(item, li) {
  if (!item.linearIssue) item.linearIssue = { workspace: li.workspace, issueId: li.issueId, slug: li.slug || null };
  else if (li.slug && !item.linearIssue.slug) item.linearIssue.slug = li.slug;
}

function mergeFields(item, obs) {
  if (obs.pr) addPr(item, obs.pr);
  if (obs.linearReview) addReview(item, obs.linearReview);
  if (obs.linearIssue) setIssue(item, obs.linearIssue);
  item.updatedAt = Date.now();
}

function reindex(db, item) {
  for (const p of item.prs) db.index.byPr[prKey(p)] = item.id;
  if (item.linearIssue) db.index.byIssue[issueKey(item.linearIssue)] = item.id;
  for (const r of item.linearReviews) db.index.byReview[reviewKey(r)] = item.id;
}

function mergeObservation(db, obs) {
  const matches = indexLookup(db, obs);
  let item;
  if (matches.length === 0) {
    const id = newId(obs);
    item = db.items[id] || { id, linearIssue: null, linearReviews: [], prs: [], updatedAt: 0 };
    db.items[id] = item;
  } else if (matches.length === 1) {
    item = db.items[matches[0]];
  } else {
    // 2+: previously-separate records are the same work item. Merge into the oldest id and
    // fold the rest in, then delete the losers. reindex() repoints all their index entries.
    const items = matches.map((id) => db.items[id]).sort((a, b) => a.updatedAt - b.updatedAt);
    item = items[0];
    for (const loser of items.slice(1)) {
      if (loser === item) continue;
      loser.prs.forEach((p) => addPr(item, p));
      loser.linearReviews.forEach((r) => addReview(item, r));
      if (loser.linearIssue) setIssue(item, loser.linearIssue);
      delete db.items[loser.id];
    }
  }
  mergeFields(item, obs);
  reindex(db, item);
  return item;
}

function isEmpty(obs) {
  return !obs || (!obs.pr && !obs.linearIssue && !obs.linearReview);
}

// Public entry point used by the service worker. Serialized by the caller's write queue.
export async function handleObserve(observation) {
  if (isEmpty(observation)) return null;
  const db = await load();
  const item = mergeObservation(db, observation);
  await save(db);
  return item;
}

// Exposed for tests / debugging.
export { mergeObservation, emptyDb, indexLookup };
