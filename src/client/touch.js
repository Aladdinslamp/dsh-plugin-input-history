/**
 * TouchBridge — mobile counterpart of KeyBridge. See docs/design.md §4.5.
 *
 * On touch devices (coarse pointer, no hover) the keyboard is unavailable, so
 * vertical swipes inside the composer replace ↑/↓:
 *   swipe up   → same as ↑: begin browsing / step one entry older
 *   swipe down → same as ↓: step one entry newer, restore draft past newest
 *
 * Chrome registers document-level touchstart/touchmove as passive by default,
 * so by touchend the chat behind the composer has already scrolled. Instead
 * we judge the gesture as soon as touchmove shows a vertical-dominant drag:
 * from that moment the gesture is "locked", preventDefault() stops the page
 * scroll, and touchend applies the history step. Everything else — taps,
 * horizontal drags, ineligible states — never locks and stays fully native.
 */
import { advance, begin, current, isBrowsing, position, retreat } from './store.js';

/** Drag distance (px) at which a vertical gesture locks and blocks scrolling. */
const LOCK_PX = 6;
/** Total vertical distance (px) required for a locked gesture to fire. */
const FIRE_PX = 40;

/** True when this environment is touch-primary (phone / tablet). */
export function isTouchDevice() {
  try {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const noHover = window.matchMedia('(hover: none)').matches;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    return (coarse || noHover) && hasTouch;
  } catch {
    return false;
  }
}

function inComposer(target) {
  const el = target instanceof Element ? target : null;
  if (!el) return null;
  const editable = el.closest('[contenteditable="true"], [contenteditable=""]');
  if (!editable) return null;
  const card = editable.closest('[data-composer-card]');
  return card ? editable : null;
}

function menuOpen(card) {
  return card.querySelector('[role="listbox"], [role="dialog"]') !== null;
}

/** Shared guard: may this gesture participate in history browsing at all? */
function eligible(input, state, card) {
  if (menuOpen(card)) return false;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) return false;
  if (input.phase !== undefined && input.phase !== 'plain') return false;
  // Browsing gestures always count; otherwise only an idle composer with an
  // empty draft locks the touch (so swipes never fight typed text).
  if (!isBrowsing(state) && input.draft !== '') return false;
  return true;
}

/**
 * Stamp scroll policy on the composer card. Adaptive: when the draft is long
 * enough to scroll inside the composer, allow vertical panning there but keep
 * overscroll-behavior contain so the scroll never chains into the chat;
 * otherwise disallow scrolling entirely. Browsers consult this CSS before a
 * drag can scroll at all — preventDefault() alone cannot always win that race
 * (especially on iOS Safari). The page behind the composer never scrolls.
 */
function stampScrollPolicy(card, editor) {
  const overflows = editor.scrollHeight > editor.clientHeight + 1;
  card.style.touchAction = overflows ? 'pan-y' : 'none';
  editor.style.overscrollBehavior = 'contain';
}

export class TouchBridge {
  /**
   * Same io contract as KeyBridge, plus onChange to refresh the bubble.
   * @param {object} io - { getInput, getStore, setStore, setDraft, onChange }
   */
  constructor(io) {
    this.io = io;
    this.track = null; // { x, y, editor, card, locked } while one finger is down in the composer
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    // passive: false is essential — without it preventDefault() is a no-op on
    // document-level touch listeners in Chrome and the page scrolls anyway.
    const opts = { capture: true, passive: false };
    document.addEventListener('touchstart', this.onTouchStart, opts);
    document.addEventListener('touchmove', this.onTouchMove, opts);
    document.addEventListener('touchend', this.onTouchEnd, opts);
    document.addEventListener('touchcancel', this.onTouchEnd, opts);
    this.onFocusIn = (event) => {
      const editor = inComposer(event.target);
      const card = editor?.closest('[data-composer-card]');
      if (card) stampScrollPolicy(card, editor);
    };
    document.addEventListener('focusin', this.onFocusIn, true);
  }

  dispose() {
    const opts = { capture: true, passive: false };
    document.removeEventListener('touchstart', this.onTouchStart, opts);
    document.removeEventListener('touchmove', this.onTouchMove, opts);
    document.removeEventListener('touchend', this.onTouchEnd, opts);
    document.removeEventListener('touchcancel', this.onTouchEnd, opts);
    document.removeEventListener('focusin', this.onFocusIn, true);
  }

  onTouchStart(event) {
    if (event.touches.length !== 1) { this.track = null; return; }
    const touch = event.touches[0];
    const editor = inComposer(touch.target);
    const card = editor?.closest('[data-composer-card]') ?? null;
    if (card) stampScrollPolicy(card, editor); // before the scroll decision
    this.track = editor && card ? { x: touch.clientX, y: touch.clientY, editor, card, locked: false } : null;
  }

  onTouchMove(event) {
    const start = this.track;
    if (!start) return;
    if (start.locked) {
      // Already ours: keep swallowing every move so neither native scrolling
      // nor any JS-driven scroll handler further up the tree sees it.
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.touches.length !== 1) { this.track = null; return; }
    const touch = event.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Vertical-dominant drag past the lock threshold: take the gesture away
    // from native scrolling for the rest of this touch.
    if (Math.abs(dy) >= LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
      const input = this.io.getInput();
      if (!eligible(input, this.io.getStore(), start.card)) { this.track = null; return; }
      start.locked = true;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  onTouchEnd(event) {
    const start = this.track;
    this.track = null;
    if (!start) return;
    if (start.locked) {
      event.preventDefault();
      event.stopPropagation();
    } else {
      return; // unlocked gestures were never ours
    }
    if (event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dy) < FIRE_PX) return; // locked but too short: treat as scroll cancel
    if (Math.abs(dx) > Math.abs(dy)) return; // drifted horizontal overall: no history step

    const input = this.io.getInput();
    const state = this.io.getStore();
    if (!eligible(input, state, start.card)) return;

    if (dy < 0) {
      // Swipe up ≡ ↑.
      let next;
      if (isBrowsing(state)) {
        next = advance(state);
      } else {
        next = begin(state, input.draft); // empty draft (eligibility guarantees it)
        if (next === state) return;
      }
      const text = current(next);
      if (text === null) return;
      event.preventDefault();
      this.io.setStore(next);
      this.io.setDraft(text);
      this.io.onChange();
      return;
    }

    // Swipe down ≡ ↓. While browsing: step one entry newer; past the newest
    // the snapshot (the pre-browsing draft, normally empty) is restored and
    // browsing exits. While merely idle (empty draft, not browsing): the
    // touch is still swallowed so the chat content never scrolls.
    if (!isBrowsing(state)) return;
    const { state: next, restore } = retreat(state);
    event.preventDefault();
    this.io.setStore(next);
    this.io.setDraft(restore !== null ? restore : current(next) ?? '');
    this.io.onChange();
  }
}

export { position };
