import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldInterceptArrowUp, shouldInterceptArrowDown, isEditKey } from '../src/client/guards.js';

const base = {
  phase: 'plain',
  draft: '',
  caretAtStart: false,
  hasSelection: false,
  composing: false,
  menuOpen: false,
  modifiers: false,
};

test('G1: IME composition blocks interception', () => {
  assert.equal(shouldInterceptArrowUp({ ...base, composing: true }), false);
});

test('G2: non-plain phase blocks interception', () => {
  for (const phase of ['adjudicating', 'claimed', 'submitting']) {
    assert.equal(shouldInterceptArrowUp({ ...base, phase }), false, phase);
  }
});

test('G3: open trigger menu blocks interception', () => {
  assert.equal(shouldInterceptArrowUp({ ...base, menuOpen: true }), false);
});

test('G4: empty draft intercepts regardless of caret', () => {
  assert.equal(shouldInterceptArrowUp(base), true);
  assert.equal(shouldInterceptArrowUp({ ...base, caretAtStart: true }), true);
});

test('G4: non-empty draft only intercepts with caret at the very start', () => {
  assert.equal(shouldInterceptArrowUp({ ...base, draft: 'hello' }), false);
  assert.equal(shouldInterceptArrowUp({ ...base, draft: 'hello', caretAtStart: true }), true);
});

test('G5: an active selection blocks interception', () => {
  assert.equal(shouldInterceptArrowUp({ ...base, draft: 'x', caretAtStart: true, hasSelection: true }), false);
});

test('modifier keys block interception (Alt+Up etc. stay native)', () => {
  assert.equal(shouldInterceptArrowUp({ ...base, modifiers: true }), false);
});

test('↓ only intercepts while browsing', () => {
  const k = { composing: false, modifiers: false };
  assert.equal(shouldInterceptArrowDown({ ...k, browsing: true }), true);
  assert.equal(shouldInterceptArrowDown({ ...k, browsing: false }), false);
  assert.equal(shouldInterceptArrowDown({ ...k, browsing: true, composing: true }), false);
  assert.equal(shouldInterceptArrowDown({ ...k, browsing: true, modifiers: true }), false);
});

test('edit keys: printable keys, Backspace, Delete — but not arrows or Esc', () => {
  assert.equal(isEditKey('a'), true);
  assert.equal(isEditKey('中文'.charAt(0)), true);
  assert.equal(isEditKey('Backspace'), true);
  assert.equal(isEditKey('Delete'), true);
  assert.equal(isEditKey('Escape'), false);
  assert.equal(isEditKey('ArrowUp'), false);
  assert.equal(isEditKey('Shift'), false);
});
