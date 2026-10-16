/**
 * sessionCtx — per-session history context, following the DSH plugin
 * session-ctx convention (cf. code-viewer sessionCtx.ts):
 *   two storage layers — a module-level Map (page lifecycle, instant hot
 *   switches) + localStorage (survives refresh). Pure module, storage
 *   injectable (node:test uses a Map wrapper).
 *
 * Per session at most MAX_ENTRIES history entries are kept; pushing beyond
 * the cap overwrites the oldest entries (newest-first slice in store.js).
 */

import { MAX_ENTRIES } from './store.js';

const PREFIX = 'dsh-input-history:ctx:';
const LEGACY_PREFIX = 'dsh-input-history:';

/** Per-device session LRU cap (each session carries up to MAX_ENTRIES). */
export const SESSION_CAP = 24;

/** Module layer: page-lifetime hot cache, sessionId -> entries (newest first). */
const memory = new Map();

function storage() {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function lsKeys(ls) {
  const out = [];
  for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k !== null) out.push(k); }
  return out;
}

function parseEntries(raw) {
  try {
    const v = JSON.parse(raw);
    const list = Array.isArray(v) ? v : (v && Array.isArray(v.entries) ? v.entries : null); // ctx {entries,t} or legacy [...]
    if (list) return list.filter((e) => e && typeof e.text === 'string');
  } catch { /* corrupted — no memory */ }
  return null;
}

/**
 * Load one session's history entries (newest first). Order: memory layer →
 * ctx storage layer → legacy key migration. Missing/corrupted = empty.
 */
export function loadSessionHistory(sessionId, inject) {
  if (!sessionId) return [];
  const hot = memory.get(sessionId);
  if (hot) return hot;
  const ls = inject ?? storage();
  if (!ls) return [];
  let raw = null;
  try { raw = ls.getItem(PREFIX + sessionId); } catch { return []; }
  let entries = raw ? parseEntries(raw) : null;
  if (entries === null) {
    // One-time migration from the v1 flat key, then rewrite under the ctx key.
    let legacyRaw = null;
    try { legacyRaw = ls.getItem(LEGACY_PREFIX + sessionId); } catch { /* ignore */ }
    entries = legacyRaw ? parseEntries(legacyRaw) : [];
    if (entries === null) entries = [];
    saveSessionHistory(sessionId, entries, undefined, inject);
    if (legacyRaw !== null) { try { ls.removeItem(LEGACY_PREFIX + sessionId); } catch { /* ignore */ } }
  }
  // 2026-10-16 移除跨会话恢复兜底：新会话（本地无该 sessionId 的 key）会把
  // localStorage 里所有工作区/所有会话的历史合并进来，导致"一新建就 500 条"。
  // 历史严格按 sessionId 存取；服务器重启换 id 导致的孤儿历史不再自动找回。
  memory.set(sessionId, entries);
  return entries;
}

/**
 * Persist one session's history (timestamped; LRU-prunes the ctx layer when
 * more than SESSION_CAP sessions carry history). Best effort: quota or
 * privacy-mode failures degrade to memory-only.
 */
export function saveSessionHistory(sessionId, entries, now = () => Date.now(), inject) {
  if (!sessionId) return;
  const trimmed = Array.isArray(entries) ? entries.slice(0, MAX_ENTRIES) : [];
  memory.set(sessionId, trimmed);
  const ls = inject ?? storage();
  if (!ls) return;
  try {
    ls.setItem(PREFIX + sessionId, JSON.stringify({ entries: trimmed, t: now() }));
    const mine = lsKeys(ls).filter((k) => k.startsWith(PREFIX));
    if (mine.length <= SESSION_CAP) return;
    const stamped = mine
      .map((k) => { try { return { k, t: (JSON.parse(ls.getItem(k) ?? '') ?? {}).t ?? 0 }; } catch { return { k, t: 0 }; } })
      .sort((a, b) => a.t - b.t);
    for (let i = 0; i < stamped.length - SESSION_CAP; i++) {
      const dropped = stamped[i].k.slice(PREFIX.length);
      memory.delete(dropped);
      ls.removeItem(stamped[i].k);
    }
  } catch { /* best effort */ }
}

/** Drop every history ctx entry (all sessions). */
export function resetSessionHistory() {
  memory.clear();
  const ls = storage();
  if (!ls) return;
  try {
    for (const k of lsKeys(ls)) if (k.startsWith(PREFIX) || k.startsWith(LEGACY_PREFIX)) ls.removeItem(k);
  } catch { /* best effort */ }
}
