import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, begin, current, emptyState, exit, isBrowsing, MAX_ENTRIES, mergeEntries, position, pushEntry, retreat } from '../src/client/store.js';

test('empty history: begin is a no-op', () => {
  const s = begin(emptyState(), 'draft');
  assert.equal(isBrowsing(s), false);
  assert.equal(current(s), null);
});

test('push then browse: ↑ recalls the newest sent input', () => {
  let s = pushEntry(emptyState(), 'first message', 1);
  s = pushEntry(s, 'second message', 2);
  s = begin(s, '');
  assert.equal(current(s), 'second message');
  s = advance(s);
  assert.equal(current(s), 'first message');
  // oldest: further ↑ stays put
  s = advance(s);
  assert.equal(current(s), 'first message');
});

test('consecutive duplicates collapse into one entry', () => {
  let s = pushEntry(emptyState(), 'same text', 1);
  s = pushEntry(s, 'same text', 2);
  assert.equal(s.entries.length, 1);
});

test('empty text is never recorded', () => {
  const s = pushEntry(emptyState(), '   ', 1);
  assert.equal(s.entries.length, 0);
  const s2 = pushEntry(emptyState(), '', 1);
  assert.equal(s2.entries.length, 0);
});

test('↓ past the newest restores the pre-browsing snapshot', () => {
  let s = pushEntry(emptyState(), 'sent text', 1);
  s = begin(s, 'my draft in progress');
  const { state, restore } = retreat(s);
  assert.equal(isBrowsing(state), false);
  assert.equal(restore, 'my draft in progress');
});

test('↓ inside history walks back toward the newest', () => {
  let s = pushEntry(emptyState(), 'older', 1);
  s = pushEntry(s, 'newer', 2);
  s = begin(s, '');
  s = advance(s);
  assert.equal(current(s), 'older');
  const stepped = retreat(s);
  assert.equal(current(stepped.state), 'newer');
  assert.equal(stepped.restore, null);
});

test('Esc exits browsing and restores the snapshot', () => {
  let s = pushEntry(emptyState(), 'sent', 1);
  s = begin(s, 'original');
  s = advance(s);
  const { state, restore } = exit(s, true);
  assert.equal(isBrowsing(state), false);
  assert.equal(restore, 'original');
});

test('typing while browsing exits without restore (keeps recalled text)', () => {
  let s = pushEntry(emptyState(), 'sent', 1);
  s = begin(s, 'original');
  const { state, restore } = exit(s, false);
  assert.equal(isBrowsing(state), false);
  assert.equal(restore, null);
});

test('entry cap: at most MAX_ENTRIES entries are kept (oldest overwritten)', () => {
  let s = emptyState();
  for (let i = 0; i < MAX_ENTRIES + 5; i++) s = pushEntry(s, 'm' + i, i);
  assert.equal(s.entries.length, MAX_ENTRIES);
  assert.equal(s.entries[0].text, 'm' + (MAX_ENTRIES + 4)); // newest first
  assert.equal(s.entries[MAX_ENTRIES - 1].text, 'm5'); // oldest kept: dropped 0-4
});

test('begin while already browsing does not overwrite the snapshot', () => {
  let s = pushEntry(emptyState(), 'sent', 1);
  s = begin(s, 'keep me');
  const again = begin(s, 'other');
  assert.equal(again, s);
});

test('position reports 1-based index and count while browsing', () => {
  let s = pushEntry(emptyState(), 'a', 1);
  s = pushEntry(s, 'b', 2);
  s = begin(s, '');
  assert.deepEqual(position(s), { index: 1, count: 2 });
  s = advance(s);
  assert.deepEqual(position(s), { index: 2, count: 2 });
  assert.equal(position(emptyState()), null);
});


// ---- cross-device merge (store.mergeEntries) ----

test('mergeEntries unions both sides, newer seq wins on text collisions', () => {
  let s = pushEntry(emptyState(), 'shared', 10);
  s = pushEntry(s, 'local-only', 12);
  const merged = mergeEntries(s, [
    { text: 'shared', seq: 11 },   // newer duplicate of a local entry
    { text: 'remote-only', seq: 9 },
  ]);
  assert.deepEqual(merged.entries.map((e) => e.text), ['local-only', 'shared', 'remote-only']);
  assert.equal(merged.entries.find((e) => e.text === 'shared').seq, 11);
});

test('mergeEntries with identical data returns the same state object', () => {
  let s = pushEntry(emptyState(), 'a', 1);
  assert.equal(mergeEntries(s, [{ text: 'a', seq: 1 }]), s);
});

test('mergeEntries caps at MAX_ENTRIES and tolerates junk input', () => {
  let s = pushEntry(emptyState(), 'base', 1);
  const incoming = [{ text: 'x', seq: 2 }, null, {}, { text: '' }];
  for (let i = 0; i < MAX_ENTRIES + 2; i++) incoming.push({ text: 'n' + i, seq: 100 + i });
  const merged = mergeEntries(s, incoming);
  assert.equal(merged.entries.length, MAX_ENTRIES);
  assert.equal(merged.entries[0].text, 'n' + (MAX_ENTRIES + 1));
});
