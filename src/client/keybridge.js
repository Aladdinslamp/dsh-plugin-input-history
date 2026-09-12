/**
 * KeyBridge — document-level capture-phase key handling that talks to the
 * HistoryStore. See docs/design.md §4.5.
 *
 * We listen on `document` in the capture phase and only act when the event
 * target sits inside the composer's contenteditable (the card rendered by
 * ui-conversation carries [data-composer-card]). Everything else — including
 * every guard failure — passes through untouched.
 */
import { advance, begin, current, exit, isBrowsing, position, retreat } from './store.js';
import { isEditKey, shouldInterceptArrowDown, shouldInterceptArrowUp } from './guards.js';

function inComposer(target) {
  const el = target instanceof Element ? target : null;
  if (!el) return null;
  const editable = el.closest('[contenteditable="true"], [contenteditable=""]');
  if (!editable) return null;
  const card = editable.closest('[data-composer-card]');
  return card ? editable : null;
}

/** True when the caret sits before every character of the editor text. */
export function caretAtStart(editor) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  if (!editor.contains(sel.anchorNode)) return false;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(editor);
  try {
    range.setEnd(sel.anchorNode, sel.anchorOffset);
  } catch {
    return false;
  }
  return range.toString().length === 0;
}

/** True while an input-trigger menu (role=listbox/dialog in the card) is open. */
function menuOpen(card) {
  return card.querySelector('[role="listbox"], [role="dialog"]') !== null;
}

export class KeyBridge {
  /**
   * @param {object} io
   * @param {() => { draft: string; draftRev: number; phase: string }} io.getInput - latest InputState snapshot.
   * @param {() => import('./store.js').HistoryState} io.getStore - latest HistoryStore state.
   * @param {(state: import('./store.js').HistoryState) => void} io.setStore - publish a new store state.
   * @param {(text: string) => void} io.setDraft - replace the composer draft.
   * @param {() => void} io.onChange - notify the owner (re-render bubble).
   */
  constructor(io) {
    this.io = io;
    this.composing = false;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.onCompositionStart = () => { this.composing = true; };
    this.onCompositionEnd = () => { this.composing = false; };
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('compositionstart', this.onCompositionStart, true);
    document.addEventListener('compositionend', this.onCompositionEnd, true);
  }

  dispose() {
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('compositionstart', this.onCompositionStart, true);
    document.removeEventListener('compositionend', this.onCompositionEnd, true);
  }

  handleKeyDown(event) {
    const editor = inComposer(event.target);
    if (!editor) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Escape' && !isEditKey(event.key)) return;

    const input = this.io.getInput();
    const state = this.io.getStore();
    const card = editor.closest('[data-composer-card]');
    const modifiers = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    const open = menuOpen(card);

    if (event.key === 'ArrowUp') {
      const guard = {
        phase: input.phase,
        draft: input.draft,
        caretAtStart: caretAtStart(editor),
        hasSelection: !window.getSelection()?.isCollapsed,
        composing: this.composing || event.isComposing,
        menuOpen: open,
        modifiers,
      };
      const decision = isBrowsing(state) || shouldInterceptArrowUp(guard);
      if (decision) {
        const entered = isBrowsing(state) ? state : begin(state, input.draft);
        if (!isBrowsing(state) && entered === state) return; // nothing to browse
        const next = advance(entered);
        const text = current(next);
        if (text === null) return;
        event.preventDefault();
        event.stopPropagation();
        this.io.setStore(next);
        this.io.setDraft(text);
        this.io.onChange();
      }
      return;
    }

    if (event.key === 'ArrowDown' && shouldInterceptArrowDown({ composing: this.composing || event.isComposing, modifiers, browsing: isBrowsing(state) })) {
      const { state: next, restore } = retreat(state);
      event.preventDefault();
      event.stopPropagation();
      this.io.setStore(next);
      if (restore !== null) {
        this.io.setDraft(restore);
      } else {
        const text = current(next);
        if (text !== null) this.io.setDraft(text);
      }
      this.io.onChange();
      return;
    }

    if (event.key === 'Escape' && isBrowsing(state) && !open) {
      const { state: next, restore } = exit(state, true);
      event.preventDefault();
      event.stopPropagation();
      this.io.setStore(next);
      if (restore !== null) this.io.setDraft(restore);
      this.io.onChange();
      return;
    }

    // Any edit while browsing silently leaves browsing, keeping the recalled
    // text so the user can continue editing it.
    if (isEditKey(event.key) && isBrowsing(state)) {
      const { state: next } = exit(state, false);
      this.io.setStore(next);
      this.io.onChange();
    }
  }
}

export { position };
