window.__ModuleLoader__.load({
	id: "dsh-plugin-input-history",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/HistoryDock.tsx
var import_react = require("react");

// src/client/store.js
var MAX_ENTRIES = 100;
function emptyState() {
  return { entries: [], cursor: -1, snapshot: null };
}
function pushEntry(state, text, seq) {
  const trimmed = String(text ?? "").trim();
  if (trimmed.length === 0) return state;
  const newest = state.entries[0];
  if (newest && newest.text === trimmed) return state;
  const entries = [{ text: trimmed, seq }, ...state.entries].slice(0, MAX_ENTRIES);
  return { ...state, entries };
}
function begin(state, currentDraft) {
  if (state.entries.length === 0) return state;
  if (state.cursor !== -1) return state;
  return { ...state, cursor: 0, snapshot: String(currentDraft ?? "") };
}
function isBrowsing(state) {
  return state.cursor !== -1;
}
function current(state) {
  if (!isBrowsing(state)) return null;
  const entry = state.entries[state.cursor];
  return entry ? entry.text : null;
}
function advance(state) {
  if (!isBrowsing(state)) return state;
  const next = Math.min(state.cursor + 1, state.entries.length - 1);
  return { ...state, cursor: next };
}
function retreat(state) {
  if (!isBrowsing(state)) return { state, restore: null };
  if (state.cursor === 0) {
    return { state: { ...state, cursor: -1, snapshot: null }, restore: state.snapshot };
  }
  return { state: { ...state, cursor: state.cursor - 1 }, restore: null };
}
function exit(state, restoreSnapshot) {
  if (!isBrowsing(state)) return { state, restore: null };
  const snapshot = state.snapshot;
  return {
    state: { ...state, cursor: -1, snapshot: null },
    restore: restoreSnapshot ? snapshot : null
  };
}
function position(state) {
  if (!isBrowsing(state)) return null;
  return { index: state.cursor + 1, count: state.entries.length };
}

// src/client/guards.js
function shouldInterceptArrowUp(g) {
  if (g.composing) return false;
  if (g.phase !== "plain") return false;
  if (g.menuOpen) return false;
  if (g.hasSelection) return false;
  if (g.modifiers) return false;
  if (g.draft === "") return true;
  return g.caretAtStart;
}
function shouldInterceptArrowDown(g) {
  return !g.composing && !g.modifiers && g.browsing;
}
function isEditKey(key) {
  return key === "Backspace" || key === "Delete" || key.length === 1 && key !== "Escape";
}

// src/client/keybridge.js
function inComposer(target) {
  const el = target instanceof Element ? target : null;
  if (!el) return null;
  const editable = el.closest('[contenteditable="true"], [contenteditable=""]');
  if (!editable) return null;
  const card = editable.closest("[data-composer-card]");
  return card ? editable : null;
}
function caretAtStart(editor) {
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
function menuOpen(card) {
  return card.querySelector('[role="listbox"], [role="dialog"]') !== null;
}
var KeyBridge = class {
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
    this.onCompositionStart = () => {
      this.composing = true;
    };
    this.onCompositionEnd = () => {
      this.composing = false;
    };
    document.addEventListener("keydown", this.handleKeyDown, true);
    document.addEventListener("compositionstart", this.onCompositionStart, true);
    document.addEventListener("compositionend", this.onCompositionEnd, true);
  }
  dispose() {
    document.removeEventListener("keydown", this.handleKeyDown, true);
    document.removeEventListener("compositionstart", this.onCompositionStart, true);
    document.removeEventListener("compositionend", this.onCompositionEnd, true);
  }
  handleKeyDown(event) {
    const editor = inComposer(event.target);
    if (!editor) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Escape" && !isEditKey(event.key)) return;
    const input = this.io.getInput();
    const state = this.io.getStore();
    const card = editor.closest("[data-composer-card]");
    const modifiers = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    const open = menuOpen(card);
    if (event.key === "ArrowUp") {
      const guard = {
        phase: input.phase,
        draft: input.draft,
        caretAtStart: caretAtStart(editor),
        hasSelection: !window.getSelection()?.isCollapsed,
        composing: this.composing || event.isComposing,
        menuOpen: open,
        modifiers
      };
      const decision = isBrowsing(state) || shouldInterceptArrowUp(guard);
      if (decision) {
        const entered = isBrowsing(state) ? state : begin(state, input.draft);
        if (!isBrowsing(state) && entered === state) return;
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
    if (event.key === "ArrowDown" && shouldInterceptArrowDown({ composing: this.composing || event.isComposing, modifiers, browsing: isBrowsing(state) })) {
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
    if (event.key === "Escape" && isBrowsing(state) && !open) {
      const { state: next, restore } = exit(state, true);
      event.preventDefault();
      event.stopPropagation();
      this.io.setStore(next);
      if (restore !== null) this.io.setDraft(restore);
      this.io.onChange();
      return;
    }
    if (isEditKey(event.key) && isBrowsing(state)) {
      const { state: next } = exit(state, false);
      this.io.setStore(next);
      this.io.onChange();
    }
  }
};

// src/client/HistoryDock.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function storageKey(sessionId) {
  return `dsh-input-history:${sessionId}`;
}
function loadPersisted(sessionId) {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(sessionId));
    if (raw) {
      const entries = JSON.parse(raw);
      if (Array.isArray(entries)) return { entries, cursor: -1, snapshot: null };
    }
  } catch {
  }
  return emptyState();
}
function persist(sessionId, entries) {
  try {
    globalThis.localStorage?.setItem(storageKey(sessionId), JSON.stringify(entries));
  } catch {
  }
}
function HistoryDock(props) {
  const { inputActions, session } = props;
  const sessionId = session?.sessionId ?? "";
  const input = props.useInput ? props.useInput((s) => s) : props.input;
  const inputRef = (0, import_react.useRef)(input);
  inputRef.current = input;
  const [store, setStore] = (0, import_react.useState)(() => sessionId ? loadPersisted(sessionId) : emptyState());
  const storeRef = (0, import_react.useRef)(store);
  storeRef.current = store;
  const [, setTick] = (0, import_react.useState)(0);
  const pendingRef = (0, import_react.useRef)(null);
  const gestureRef = (0, import_react.useRef)(null);
  const lastNonEmptyRef = (0, import_react.useRef)("");
  (0, import_react.useEffect)(() => {
    setStore(sessionId ? loadPersisted(sessionId) : emptyState());
    pendingRef.current = null;
    gestureRef.current = null;
    lastNonEmptyRef.current = "";
  }, [sessionId]);
  (0, import_react.useEffect)(() => {
    const capture = () => {
      const text = inputRef.current?.draft ?? "";
      if (text.trim()) gestureRef.current = { text, at: Date.now() };
    };
    const onKeyDown = (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target?.closest('[data-composer-card] [contenteditable="true"], [data-composer-card] [contenteditable=""]')) return;
      capture();
    };
    const onPointerDown = (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target?.closest("[data-composer-card] button")) return;
      capture();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);
  const phase = input?.phase;
  const draft = input?.draft;
  const prevDraftRef = (0, import_react.useRef)(void 0);
  (0, import_react.useEffect)(() => {
    if (draft === void 0) return;
    const prev = prevDraftRef.current;
    prevDraftRef.current = draft;
    if (phase !== void 0 && phase !== "plain" && draft) pendingRef.current = draft;
    const cleared = prev !== void 0 && prev !== "" && draft === "";
    const captured = pendingRef.current ?? gestureRef.current?.text ?? null;
    const gestureFresh = gestureRef.current !== null && Date.now() - gestureRef.current.at < 3e3;
    if (cleared && captured) {
      const viaGesture = gestureRef.current !== null && gestureFresh;
      const viaPhase = pendingRef.current !== null;
      if (viaGesture || viaPhase) {
        setStore((s) => {
          const next = pushEntry(s, captured, Date.now());
          persist(sessionId, next.entries);
          return next;
        });
      }
    }
    if (draft === "") {
      pendingRef.current = null;
      gestureRef.current = null;
    }
    if (draft.trim()) lastNonEmptyRef.current = draft;
  }, [phase, draft, sessionId]);
  const actionsRef = (0, import_react.useRef)(inputActions);
  actionsRef.current = inputActions;
  (0, import_react.useEffect)(() => {
    if (!inputActions) return;
    const bridge = new KeyBridge({
      getInput: () => inputRef.current ?? { draft: "", draftRev: 0, phase: "plain" },
      getStore: () => storeRef.current,
      setStore: (next) => {
        storeRef.current = next;
        setStore(next);
      },
      setDraft: (text) => actionsRef.current?.setDraft(text),
      onChange: () => setTick((t) => t + 1)
    });
    return () => bridge.dispose();
  }, [sessionId, Boolean(inputActions)]);
  const pos = position(store);
  const bubble = (0, import_react.useMemo)(() => {
    if (!pos) return null;
    return `${pos.index}/${pos.count}`;
  }, [pos]);
  if (!bubble || !isBrowsing(store)) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      "data-input-history-bubble": "",
      style: {
        position: "absolute",
        right: 12,
        bottom: "calc(100% + 4px)",
        fontSize: 12,
        lineHeight: "18px",
        padding: "2px 10px",
        borderRadius: 10,
        background: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.55))",
        color: "var(--dsw-alias-label-primary, #ddd)",
        pointerEvents: "none",
        zIndex: 20
      },
      children: `\u5386\u53F2 ${bubble}`
    }
  );
}

// src/client/index.ts
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject(
    "conversation.input.dock",
    () => ctx.slots.register(
      {
        name: "conversation.input.dock",
        id: "input-history",
        order: 90
      },
      HistoryDock
    )
  );
}

		return module.exports;
	}
});
