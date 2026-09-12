/**
 * Keyboard guards for the input-history plugin. Pure functions — see
 * docs/design.md §4.1. The highest principle: when in doubt, stand down and
 * let the composer's native behaviour win.
 */

/**
 * Decide whether a plain ↑ keypress should be intercepted to start (or
 * continue) history browsing. All guards must pass.
 *
 * @param {object} g
 * @param {string} g.phase - InputState.phase ('plain' | 'adjudicating' | 'claimed' | 'submitting').
 * @param {string} g.draft - current draft text.
 * @param {boolean} g.caretAtStart - caret sits before every character of the draft.
 * @param {boolean} g.hasSelection - a non-collapsed text selection exists.
 * @param {boolean} g.composing - an IME composition is active.
 * @param {boolean} g.menuOpen - a trigger menu (slash commands / references) is open.
 * @param {boolean} g.modifiers - any modifier key (alt/ctrl/meta/shift) is held.
 * @returns {boolean}
 */
export function shouldInterceptArrowUp(g) {
  if (g.composing) return false;        // G1 IME composition
  if (g.phase !== 'plain') return false; // G2 submit plane busy
  if (g.menuOpen) return false;          // G3 trigger menu owns ↑
  if (g.hasSelection) return false;      // G5 selection movement
  if (g.modifiers) return false;         // Alt+↑ etc. stay native
  if (g.draft === '') return true;       // G4 empty draft always browses
  return g.caretAtStart;                 // G4 non-empty draft only at start
}

/**
 * Decide whether a plain ↓ keypress should be handled while browsing.
 * ↓ only means "history" when browsing; otherwise it is always native.
 */
export function shouldInterceptArrowDown(g) {
  return !g.composing && !g.modifiers && g.browsing;
}

/** Any printable edit while browsing leaves browsing without a restore. */
export function isEditKey(key) {
  return key === 'Backspace' || key === 'Delete' || (key.length === 1 && key !== 'Escape');
}
