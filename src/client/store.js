/**
 * HistoryStore — pure history-stack logic for the input-history plugin.
 *
 * No DOM, no React, no imports: every function is (state, ...) => state so it
 * can be unit-tested directly with node:test. See docs/design.md §4.2.
 */

export const MAX_ENTRIES = 10000;

/**
 * @typedef {object} HistoryEntry
 * @property {string} text
 * @property {number} seq
 * @typedef {object} HistoryState
 * @property {HistoryEntry[]} entries - newest first.
 * @property {number} cursor - -1 = not browsing.
 * @property {string | null} snapshot - the draft captured on entering browsing.
 */

/** A fresh, idle store state. cursor -1 means "not browsing".
 * @returns {HistoryState} */
export function emptyState() {
  return { entries: [], cursor: -1, snapshot: null };
}

/**
 * Append one sent input. Consecutive duplicates collapse into one slot
 * (terminal habit: sending the same text twice is one press of ↑ away).
 * Entries are stored newest-first. Returns a new state; unchanged state is
 * returned as-is when nothing would change.
 */
export function pushEntry(state, text, seq) {
  const trimmed = String(text ?? '').trim();
  if (trimmed.length === 0) return state;
  const newest = state.entries[0];
  if (newest && newest.text === trimmed) return state;
  const entries = [{ text: trimmed, seq }, ...state.entries].slice(0, MAX_ENTRIES);
  return { ...state, entries };
}

/**
 * Enter browsing mode: remember the draft the user was typing (snapshot) and
 * point the cursor at the newest entry. A no-op without entries.
 */
export function begin(state, currentDraft) {
  if (state.entries.length === 0) return state;
  if (state.cursor !== -1) return state; // already browsing
  return { ...state, cursor: 0, snapshot: String(currentDraft ?? '') };
}

/** Whether the store is currently browsing history. */
export function isBrowsing(state) {
  return state.cursor !== -1;
}

/** The text the cursor currently points at, or null when not browsing. */
export function current(state) {
  if (!isBrowsing(state)) return null;
  const entry = state.entries[state.cursor];
  return entry ? entry.text : null;
}

/**
 * ↑ — move one step older. Stays on the oldest entry when already there.
 */
export function advance(state) {
  if (!isBrowsing(state)) return state;
  const next = Math.min(state.cursor + 1, state.entries.length - 1);
  return { ...state, cursor: next };
}

/**
 * ↓ — move one step newer. Stepping past the newest entry exits browsing and
 * restores the pre-browsing snapshot.
 * @returns {object} { state, restore } — restore is the snapshot text when
 * the caller must put the original draft back, otherwise null.
 */
export function retreat(state) {
  if (!isBrowsing(state)) return { state, restore: null };
  if (state.cursor === 0) {
    return { state: { ...state, cursor: -1, snapshot: null }, restore: state.snapshot };
  }
  return { state: { ...state, cursor: state.cursor - 1 }, restore: null };
}

/**
 * Leave browsing mode.
 * @param {boolean} restoreSnapshot - true puts the original draft back (Esc),
 *   false keeps whatever is currently in the editor (user started typing).
 */
export function exit(state, restoreSnapshot) {
  if (!isBrowsing(state)) return { state, restore: null };
  const snapshot = state.snapshot;
  return {
    state: { ...state, cursor: -1, snapshot: null },
    restore: restoreSnapshot ? snapshot : null,
  };
}

/** Drop all history (session switch). */
export function reset() {
  return emptyState();
}

/**
 * Position indicator for the "history 3/17" bubble.
 * @returns {null | { index: number, count: number }}
 */
export function position(state) {
  if (!isBrowsing(state)) return null;
  return { index: state.cursor + 1, count: state.entries.length };
}

/**
 * Union-merge incoming entries (e.g. pulled from the session workspace file
 * on another device) into the local state: dedupe by text keeping the newer
 * seq, order newest-first, cap at MAX_ENTRIES. Returns the same state object
 * when nothing changes.
 */
export function mergeEntries(state, incoming) {
  const byText = new Map();
  let dirty = false;
  for (const e of state.entries) byText.set(e.text, e);
  for (const e of Array.isArray(incoming) ? incoming : []) {
    if (!e || typeof e.text !== 'string' || e.text === '') continue;
    const local = byText.get(e.text);
    if (!local) { byText.set(e.text, e); dirty = true; }
    else if ((e.seq ?? 0) > (local.seq ?? 0)) { byText.set(e.text, e); dirty = true; }
  }
  if (!dirty) return state;
  const entries = [...byText.values()].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0)).slice(0, MAX_ENTRIES);
  return { ...state, entries };
}
