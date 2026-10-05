/**
 * TouchBridge tests. Node has no DOM, so we install minimal document/window/
 * Element fakes and drive the recorded touch listeners directly. The gesture
 * decision logic is exercised end to end against the real HistoryStore.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---- minimal DOM fakes (must exist before TouchBridge is constructed) ----

class FakeElement {
  constructor(route) { this.route = route; }
  // route: { editable: FakeElement|null, card: FakeElement|null }
  closest(sel) {
    if (sel.includes('contenteditable')) return this.route.editable ?? null;
    if (sel.includes('data-composer-card')) return this.route.card ?? null;
    return null;
  }
}

const listeners = {};
const styles = []; // touch-action values stamped onto cards, in order
globalThis.document = {
  addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
  removeEventListener: (type, fn) => {
    const arr = listeners[type];
    if (arr) { const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1); }
  },
};
globalThis.window = { getSelection: () => null, matchMedia: undefined };
globalThis.Element = FakeElement;

const { TouchBridge, isTouchDevice } = await import('../src/client/touch.js');
const { emptyState, begin, pushEntry, isBrowsing, position, current } = await import('../src/client/store.js');

// ---- helpers ----

function makeBridge(storeRef, draftRef) {
  // Isolate tests: earlier bridges on the shared fake document must go.
  for (const b of activeBridges.splice(0)) b.dispose();
  const log = [];
  const bridge = new TouchBridge({
    getInput: () => ({ draft: draftRef.text, draftRev: 0, phase: draftRef.phase ?? 'plain' }),
    getStore: () => storeRef.state,
    setStore: (next) => { storeRef.state = next; log.push('store'); },
    setDraft: (text) => { draftRef.text = text; log.push('draft:' + text); },
    onChange: () => log.push('change'),
  });
  activeBridges.push(bridge);
  return { bridge, log };
}
const activeBridges = [];

function editorTarget(card) {
  const editable = new FakeElement({ editable: new FakeElement({ editable: null, card }), card });
  editable.scrollHeight = 10;
  editable.clientHeight = 10; // default: no internal overflow
  editable.style = { touchAction: undefined, overscrollBehavior: undefined };
  return new FakeElement({ editable, card });
}

function touchStart(target, x, y) {
  for (const fn of listeners.touchstart ?? []) {
    fn({ touches: [{ clientX: x, clientY: y, target }], changedTouches: [], target, preventDefault() {}, stopPropagation() {} });
  }
}

function touchMove(target, x, y) {
  const calls = { prevent: 0, stop: 0 };
  for (const fn of listeners.touchmove ?? []) {
    const ev = { touches: [{ clientX: x, clientY: y, target }], changedTouches: [], target, preventDefault: () => calls.prevent++, stopPropagation: () => calls.stop++ };
    fn(ev);
  }
  return calls;
}

function touchEnd(target, x, y) {
  for (const fn of listeners.touchend ?? []) {
    fn({ touches: [], changedTouches: [{ clientX: x, clientY: y, target }], target, preventDefault() {}, stopPropagation() {} });
  }
}

/** Simulates a real gesture: start, a lock-point move, then the final end. */
function swipe(target, dy, dx = 0) {
  touchStart(target, 0, 100);
  const stepY = Math.sign(dy) * 20;
  touchMove(target, 0, 100 + stepY); // mid-gesture lock point
  touchEnd(target, dx, 100 + dy);
}

// ---- fixtures ----

function seededStore() {
  let state = emptyState();
  state = pushEntry(state, 'first', 1);
  state = pushEntry(state, 'second', 2);
  return { state };
}

function cardWithMenu(open) {
  const card = new FakeElement({ editable: null, card: null });
  card.style = {};
  card.querySelector = () => (open ? { mark: 'menu' } : null);
  return card;
}

function editorWithOverflow(card, overflow) {
  const target = editorTarget(card);
  const editable = target.route.editable;
  editable.scrollHeight = overflow ? 200 : 10;
  editable.clientHeight = 10;
  return target;
}

// ---- tests ----

test('isTouchDevice is false in this DOM-less environment', () => {
  assert.equal(isTouchDevice(), false);
});

test('swipe up on empty draft begins browsing at the newest entry', () => {
  const store = seededStore();
  const draft = { text: '' };
  const { log } = makeBridge(store, draft);
  swipe(editorTarget(cardWithMenu(false)), -60);
  assert.ok(isBrowsing(store.state));
  assert.equal(current(store.state), 'second');
  assert.deepEqual(position(store.state), { index: 1, count: 2 });
  assert.deepEqual(draft.text, 'second');
  assert.ok(log.includes('draft:second'));
});

test('swipe up again steps one entry older', () => {
  const store = seededStore();
  const draft = { text: '' };
  makeBridge(store, draft);
  swipe(editorTarget(cardWithMenu(false)), -60);
  swipe(editorTarget(cardWithMenu(false)), -60);
  assert.equal(current(store.state), 'first');
  assert.deepEqual(position(store.state), { index: 2, count: 2 });
  assert.equal(draft.text, 'first');
});

test('swipe down retreats; past the newest restores the pre-browsing draft', () => {
  const store = seededStore();
  const draft = { text: '' };
  makeBridge(store, draft);
  const before = store.state;
  swipe(editorTarget(cardWithMenu(false)), -60); // begin → "second"
  swipe(editorTarget(cardWithMenu(false)), -60); // → "first"
  swipe(editorTarget(cardWithMenu(false)), 60);  // back → "second"
  assert.equal(draft.text, 'second');
  swipe(editorTarget(cardWithMenu(false)), 60);  // past newest → restore
  assert.equal(isBrowsing(store.state), false);
  assert.equal(draft.text, '');
  assert.notEqual(store.state, before);
});

test('non-empty draft and not browsing: swipe does nothing', () => {
  const store = seededStore();
  const draft = { text: 'typing...' };
  const { log } = makeBridge(store, draft);
  swipe(editorTarget(cardWithMenu(false)), -60);
  assert.equal(isBrowsing(store.state), false);
  assert.equal(log.length, 0);
});

test('open trigger menu blocks the gesture', () => {
  const store = seededStore();
  const draft = { text: '' };
  const { log } = makeBridge(store, draft);
  swipe(editorTarget(cardWithMenu(true)), -60);
  assert.equal(isBrowsing(store.state), false);
  assert.equal(log.length, 0);
});

test('active text selection blocks the gesture', () => {
  const store = seededStore();
  const draft = { text: '' };
  const { log } = makeBridge(store, draft);
  globalThis.window.getSelection = () => ({ isCollapsed: false });
  swipe(editorTarget(cardWithMenu(false)), -60);
  globalThis.window.getSelection = () => null;
  assert.equal(isBrowsing(store.state), false);
  assert.equal(log.length, 0);
});

test('non-plain phase (submitting) blocks the gesture', () => {
  const store = seededStore();
  const draft = { text: '', phase: 'submitting' };
  const { log } = makeBridge(store, draft);
  swipe(editorTarget(cardWithMenu(false)), -60);
  assert.equal(isBrowsing(store.state), false);
  assert.equal(log.length, 0);
});

test('diagonal / horizontal swipes and short drags are ignored', () => {
  const store = seededStore();
  const draft = { text: '' };
  const { log } = makeBridge(store, draft);
  swipe(editorTarget(cardWithMenu(false)), -60, 120); // horizontal
  swipe(editorTarget(cardWithMenu(false)), -20);      // too short
  swipe(editorTarget(cardWithMenu(false)), 0);        // pure tap
  assert.equal(isBrowsing(store.state), false);
  assert.equal(log.length, 0);
});

test('touches outside the composer are ignored', () => {
  const store = seededStore();
  const draft = { text: '' };
  const { log } = makeBridge(store, draft);
  const outside = new FakeElement({ editable: null, card: null });
  swipe(outside, -60);
  assert.equal(isBrowsing(store.state), false);
  assert.equal(log.length, 0);
});

test('dispose removes the listeners', () => {
  const store = seededStore();
  const draft = { text: '' };
  const { bridge, log } = makeBridge(store, draft);
  bridge.dispose();
  swipe(editorTarget(cardWithMenu(false)), -60);
  assert.equal(log.length, 0);
});


test('vertical drag locks the gesture and prevents native scrolling', () => {
  const store = seededStore();
  const draft = { text: '' };
  makeBridge(store, draft);
  const target = editorTarget(cardWithMenu(false));
  touchStart(target, 0, 100);
  const first = touchMove(target, 0, 88); // 12px up: lock
  assert.ok(first.prevent >= 1);
  assert.ok(first.stop >= 1);
  const later = touchMove(target, 0, 60); // subsequent moves stay swallowed
  assert.ok(later.prevent >= 1);
  assert.ok(later.stop >= 1);
  touchEnd(target, 0, 60);
  assert.ok(isBrowsing(store.state));
});

test('horizontal drag does not lock and never blocks scrolling', () => {
  const store = seededStore();
  const draft = { text: '' };
  makeBridge(store, draft);
  const target = editorTarget(cardWithMenu(false));
  touchStart(target, 0, 100);
  const calls = touchMove(target, 30, 96);
  assert.equal(calls.prevent, 0);
  touchEnd(target, 60, 92);
  assert.equal(isBrowsing(store.state), false);
});

test('ineligible state does not lock, so the page scrolls natively', () => {
  const store = seededStore();
  const draft = { text: 'typing...' };
  makeBridge(store, draft);
  const target = editorTarget(cardWithMenu(false));
  touchStart(target, 0, 100);
  const calls = touchMove(target, 0, 80);
  assert.equal(calls.prevent, 0);
  touchEnd(target, 0, 60);
  assert.equal(isBrowsing(store.state), false);
});

test('locked but too-short drag fires nothing (treated as scroll cancel)', () => {
  const store = seededStore();
  const draft = { text: '' };
  const { log } = makeBridge(store, draft);
  const target = editorTarget(cardWithMenu(false));
  touchStart(target, 0, 100);
  touchMove(target, 0, 88);
  touchEnd(target, 0, 90); // 10px: under FIRE_PX
  assert.equal(isBrowsing(store.state), false);
  assert.equal(log.length, 0);
});


test('idle empty draft: swipe down still locks the touch (no content scroll) and is a no-op', () => {
  const store = seededStore();
  const draft = { text: '' };
  const { log } = makeBridge(store, draft);
  const before = store.state;
  const target = editorTarget(cardWithMenu(false));
  touchStart(target, 0, 100);
  const calls = touchMove(target, 0, 115); // 15px down: locks
  assert.ok(calls.prevent >= 1);
  assert.ok(calls.stop >= 1);
  touchEnd(target, 0, 160);
  assert.equal(isBrowsing(store.state), false);
  assert.equal(store.state, before); // store untouched
  assert.equal(draft.text, '');
  assert.deepEqual(log, []); // nothing fired
});

test('swiping down past the newest restores the composer to empty content', () => {
  const store = seededStore();
  const draft = { text: '' };
  makeBridge(store, draft);
  const target = editorTarget(cardWithMenu(false));
  swipe(target, -60);            // up: browsing at 1/2 ("second")
  assert.equal(draft.text, 'second');
  swipe(target, 60);             // down at index 1: exits browsing
  assert.equal(isBrowsing(store.state), false);
  assert.equal(draft.text, '');  // restored to empty, not the last entry
});


test('touching the composer stamps touch-action:none on the card', () => {
  const store = seededStore();
  const draft = { text: '' };
  makeBridge(store, draft);
  const card = cardWithMenu(false);
  touchStart(editorTarget(card), 0, 100);
  assert.equal(card.style.touchAction, 'none');
});

test('focusing the composer stamps touch-action:none before any gesture', () => {
  const store = seededStore();
  const draft = { text: '' };
  const bridge = makeBridge(store, draft).bridge;
  const card = cardWithMenu(false);
  for (const fn of listeners.focusin ?? []) {
    fn({ target: editorTarget(card) });
  }
  assert.equal(card.style.touchAction, 'none');
  bridge.dispose();
});


test('short draft: composer card forbids scrolling entirely', () => {
  const store = seededStore();
  const draft = { text: '' };
  makeBridge(store, draft);
  const card = cardWithMenu(false);
  touchStart(editorTarget(card), 0, 100);
  assert.equal(card.style.touchAction, 'none');
});

test('overflowing draft: internal pan allowed, chaining contained', () => {
  const store = seededStore();
  const draft = { text: '' };
  makeBridge(store, draft);
  const card = cardWithMenu(false);
  const target = editorWithOverflow(card, true);
  const editable = target.route.editable;
  touchStart(target, 0, 100);
  assert.equal(card.style.touchAction, 'pan-y');
  assert.equal(editable.style.overscrollBehavior, 'contain');
});
