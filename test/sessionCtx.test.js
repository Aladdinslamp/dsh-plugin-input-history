/**
 * sessionCtx tests — drives the two-layer store (memory + injectable storage)
 * with a Map-backed localStorage fake.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSessionHistory, saveSessionHistory, SESSION_CAP } from '../src/client/sessionCtx.js';
import { MAX_ENTRIES, pushEntry, emptyState } from '../src/client/store.js';

function fakeLS() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    keys: () => [...m.keys()],
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
  };
}

test('save then load round-trips entries through the ctx layer', () => {
  const ls = fakeLS();
  let s = pushEntry(emptyState(), 'first', 1);
  s = pushEntry(s, 'second', 2);
  saveSessionHistory('s1', s.entries, () => 1000, ls);
  // fresh read (bypassing this process's memory layer via the storage arg is
  // not possible for load; emulate by reading raw storage)
  const raw = JSON.parse(ls.getItem('dsh-input-history:ctx:s1'));
  assert.deepEqual(raw.entries.map((e) => e.text), ['second', 'first']);
  assert.equal(raw.t, 1000);
});

test('entries beyond MAX_ENTRIES are overwritten oldest-first', () => {
  let s = emptyState();
  for (let i = 0; i < MAX_ENTRIES + 3; i++) s = pushEntry(s, 'x' + i, i);
  assert.equal(s.entries.length, MAX_ENTRIES);
  const ls = fakeLS();
  saveSessionHistory('s2', s.entries, () => 1, ls);
  const raw = JSON.parse(ls.getItem('dsh-input-history:ctx:s2'));
  assert.equal(raw.entries.length, MAX_ENTRIES);
  assert.equal(raw.entries[0].text, 'x' + (MAX_ENTRIES + 2));
  assert.equal(raw.entries.at(-1).text, 'x3');
});

test('saving more sessions than SESSION_CAP LRU-prunes the ctx layer', () => {
  const ls = fakeLS();
  for (let i = 0; i < SESSION_CAP + 3; i++) {
    saveSessionHistory('sess' + i, [{ text: 't' + i, seq: i }], () => i, ls);
  }
  const mine = ls.keys().filter((k) => k.startsWith('dsh-input-history:ctx:'));
  assert.equal(mine.length, SESSION_CAP);
  // oldest sessions were dropped, newest kept
  assert.equal(ls.getItem('dsh-input-history:ctx:sess0'), null);
  assert.ok(ls.getItem('dsh-input-history:ctx:sess' + (SESSION_CAP + 2)) !== null);
});

test('corrupted ctx payloads parse as empty, not throw', () => {
  const ls = fakeLS();
  ls.setItem('dsh-input-history:ctx:bad', '{not json');
  // load uses the module memory layer; assert parseEntries path via load
  const entries = loadSessionHistory('never-existed', ls);
  assert.deepEqual(entries, []);
});


test('recovery fallback: entries from orphaned keys resurface in a fresh session', () => {
  const ls = fakeLS();
  ls.setItem('dsh-input-history:ctx:old-session', JSON.stringify({ entries: [{ text: 'remembered', seq: 9 }], t: 1 }));
  const entries = loadSessionHistory('brand-new-session', ls);
  assert.deepEqual(entries.map((e) => e.text), ['remembered']);
  assert.ok(JSON.parse(ls.getItem('dsh-input-history:ctx:brand-new-session')).entries.length === 1);
});

test('recovery fallback never deletes the source keys', () => {
  const ls = fakeLS();
  ls.setItem('dsh-input-history:ctx:old-session', JSON.stringify({ entries: [{ text: 'kept', seq: 1 }], t: 1 }));
  ls.setItem('dsh-input-history:legacy-flat', JSON.stringify([{ text: 'legacy', seq: 2 }]));
  loadSessionHistory('fresh', ls);
  assert.ok(ls.getItem('dsh-input-history:ctx:old-session') !== null);
  assert.ok(ls.getItem('dsh-input-history:legacy-flat') !== null);
});

test('recovery fallback: legacy flat-array keys are merged too', () => {
  const ls = fakeLS();
  ls.setItem('dsh-input-history:flat-legacy', JSON.stringify([{ text: 'a', seq: 1 }, { text: 'b', seq: 2 }]));
  const entries = loadSessionHistory('target', ls);
  assert.deepEqual(entries.map((e) => e.text), ['b', 'a']);
});
