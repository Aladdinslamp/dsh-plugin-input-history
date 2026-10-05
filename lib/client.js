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
var MAX_ENTRIES = 1e4;
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
function mergeEntries(state, incoming) {
  const byText = /* @__PURE__ */ new Map();
  let dirty = false;
  for (const e of state.entries) byText.set(e.text, e);
  for (const e of Array.isArray(incoming) ? incoming : []) {
    if (!e || typeof e.text !== "string" || e.text === "") continue;
    const local = byText.get(e.text);
    if (!local) {
      byText.set(e.text, e);
      dirty = true;
    } else if ((e.seq ?? 0) > (local.seq ?? 0)) {
      byText.set(e.text, e);
      dirty = true;
    }
  }
  if (!dirty) return state;
  const entries = [...byText.values()].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0)).slice(0, MAX_ENTRIES);
  return { ...state, entries };
}

// src/client/sessionCtx.js
var PREFIX = "dsh-input-history:ctx:";
var LEGACY_PREFIX = "dsh-input-history:";
var SESSION_CAP = 24;
var memory = /* @__PURE__ */ new Map();
function storage() {
  try {
    return typeof localStorage === "undefined" ? void 0 : localStorage;
  } catch {
    return void 0;
  }
}
function lsKeys(ls) {
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k !== null) out.push(k);
  }
  return out;
}
function parseEntries(raw) {
  try {
    const v = JSON.parse(raw);
    const list = Array.isArray(v) ? v : v && Array.isArray(v.entries) ? v.entries : null;
    if (list) return list.filter((e) => e && typeof e.text === "string");
  } catch {
  }
  return null;
}
function loadSessionHistory(sessionId, inject2) {
  if (!sessionId) return [];
  const hot = memory.get(sessionId);
  if (hot) return hot;
  const ls = inject2 ?? storage();
  if (!ls) return [];
  let raw = null;
  try {
    raw = ls.getItem(PREFIX + sessionId);
  } catch {
    return [];
  }
  let entries = raw ? parseEntries(raw) : null;
  if (entries === null) {
    let legacyRaw = null;
    try {
      legacyRaw = ls.getItem(LEGACY_PREFIX + sessionId);
    } catch {
    }
    entries = legacyRaw ? parseEntries(legacyRaw) : [];
    if (entries === null) entries = [];
    saveSessionHistory(sessionId, entries, void 0, inject2);
    if (legacyRaw !== null) {
      try {
        ls.removeItem(LEGACY_PREFIX + sessionId);
      } catch {
      }
    }
  }
  if (entries.length === 0) {
    const merged = /* @__PURE__ */ new Map();
    let newestSeq = 0;
    for (const k of lsKeys(ls)) {
      if (!k.startsWith(PREFIX) || k === PREFIX + sessionId) {
        if (!k.startsWith(LEGACY_PREFIX)) continue;
      }
      const list = parseEntries(ls.getItem(k) ?? "");
      if (!list) continue;
      for (const e of list) {
        if (!merged.has(e.text)) merged.set(e.text, e);
        if (typeof e.seq === "number" && e.seq > newestSeq) newestSeq = e.seq;
      }
    }
    if (merged.size > 0) {
      entries = [...merged.values()].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0)).slice(0, MAX_ENTRIES);
      saveSessionHistory(sessionId, entries, void 0, inject2);
    }
  }
  memory.set(sessionId, entries);
  return entries;
}
function saveSessionHistory(sessionId, entries, now = () => Date.now(), inject2) {
  if (!sessionId) return;
  const trimmed = Array.isArray(entries) ? entries.slice(0, MAX_ENTRIES) : [];
  memory.set(sessionId, trimmed);
  const ls = inject2 ?? storage();
  if (!ls) return;
  try {
    ls.setItem(PREFIX + sessionId, JSON.stringify({ entries: trimmed, t: now() }));
    const mine = lsKeys(ls).filter((k) => k.startsWith(PREFIX));
    if (mine.length <= SESSION_CAP) return;
    const stamped = mine.map((k) => {
      try {
        return { k, t: (JSON.parse(ls.getItem(k) ?? "") ?? {}).t ?? 0 };
      } catch {
        return { k, t: 0 };
      }
    }).sort((a, b) => a.t - b.t);
    for (let i = 0; i < stamped.length - SESSION_CAP; i++) {
      const dropped = stamped[i].k.slice(PREFIX.length);
      memory.delete(dropped);
      ls.removeItem(stamped[i].k);
    }
  } catch {
  }
}

// src/client/sync.js
var PATH = ".input-history.json";
var ws = null;
function setWorkspaceFiles(service) {
  ws = service ?? null;
}
async function readWhole(sid) {
  if (!ws || typeof ws.read !== "function" || !sid) return null;
  let out = "";
  for (let guard = 0; guard < 500; guard++) {
    let raw;
    try {
      raw = await ws.read(sid, PATH, { offset: out.split("\n").length });
    } catch {
      return null;
    }
    if (raw && typeof raw === "object" && "ok" in raw) {
      if (!raw.ok) return null;
      raw = raw.value ?? raw;
    }
    const page = raw ?? {};
    out += page.text ?? "";
    if (page.eof) {
      try {
        const v = JSON.parse(out);
        const list = Array.isArray(v) ? v : v && Array.isArray(v.entries) ? v.entries : null;
        return list ? list.filter((e) => e && typeof e.text === "string") : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}
async function pullShared(sessionId) {
  return readWhole(sessionId);
}
function pushShared(sessionId, entries) {
  if (!ws || typeof ws.write !== "function" || !sessionId) return;
  const body = JSON.stringify(Array.isArray(entries) ? entries.slice(0, 1e4) : []);
  ws.write(sessionId, PATH, body).catch(() => {
  });
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
        let next = state;
        if (isBrowsing(state)) {
          next = advance(state);
        } else {
          next = begin(state, input.draft);
          if (next === state) return;
        }
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

// src/client/touch.js
var LOCK_PX = 6;
var FIRE_PX = 40;
function isTouchDevice() {
  try {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const noHover = window.matchMedia("(hover: none)").matches;
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    return (coarse || noHover) && hasTouch;
  } catch {
    return false;
  }
}
function inComposer2(target) {
  const el = target instanceof Element ? target : null;
  if (!el) return null;
  const editable = el.closest('[contenteditable="true"], [contenteditable=""]');
  if (!editable) return null;
  const card = editable.closest("[data-composer-card]");
  return card ? editable : null;
}
function menuOpen2(card) {
  return card.querySelector('[role="listbox"], [role="dialog"]') !== null;
}
function eligible(input, state, card) {
  if (menuOpen2(card)) return false;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) return false;
  if (input.phase !== void 0 && input.phase !== "plain") return false;
  if (!isBrowsing(state) && input.draft !== "") return false;
  return true;
}
function stampScrollPolicy(card, editor) {
  const overflows = editor.scrollHeight > editor.clientHeight + 1;
  card.style.touchAction = overflows ? "pan-y" : "none";
  editor.style.overscrollBehavior = "contain";
}
var TouchBridge = class {
  /**
   * Same io contract as KeyBridge, plus onChange to refresh the bubble.
   * @param {object} io - { getInput, getStore, setStore, setDraft, onChange }
   */
  constructor(io) {
    this.io = io;
    this.track = null;
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    const opts = { capture: true, passive: false };
    document.addEventListener("touchstart", this.onTouchStart, opts);
    document.addEventListener("touchmove", this.onTouchMove, opts);
    document.addEventListener("touchend", this.onTouchEnd, opts);
    document.addEventListener("touchcancel", this.onTouchEnd, opts);
    this.onFocusIn = (event) => {
      const editor = inComposer2(event.target);
      const card = editor?.closest("[data-composer-card]");
      if (card) stampScrollPolicy(card, editor);
    };
    document.addEventListener("focusin", this.onFocusIn, true);
  }
  dispose() {
    const opts = { capture: true, passive: false };
    document.removeEventListener("touchstart", this.onTouchStart, opts);
    document.removeEventListener("touchmove", this.onTouchMove, opts);
    document.removeEventListener("touchend", this.onTouchEnd, opts);
    document.removeEventListener("touchcancel", this.onTouchEnd, opts);
    document.removeEventListener("focusin", this.onFocusIn, true);
  }
  onTouchStart(event) {
    if (event.touches.length !== 1) {
      this.track = null;
      return;
    }
    const touch = event.touches[0];
    const editor = inComposer2(touch.target);
    const card = editor?.closest("[data-composer-card]") ?? null;
    if (card) stampScrollPolicy(card, editor);
    this.track = editor && card ? { x: touch.clientX, y: touch.clientY, editor, card, locked: false } : null;
  }
  onTouchMove(event) {
    const start = this.track;
    if (!start) return;
    if (start.locked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.touches.length !== 1) {
      this.track = null;
      return;
    }
    const touch = event.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dy) >= LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
      const input = this.io.getInput();
      if (!eligible(input, this.io.getStore(), start.card)) {
        this.track = null;
        return;
      }
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
      return;
    }
    if (event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dy) < FIRE_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) return;
    const input = this.io.getInput();
    const state = this.io.getStore();
    if (!eligible(input, state, start.card)) return;
    if (dy < 0) {
      let next2;
      if (isBrowsing(state)) {
        next2 = advance(state);
      } else {
        next2 = begin(state, input.draft);
        if (next2 === state) return;
      }
      const text = current(next2);
      if (text === null) return;
      event.preventDefault();
      this.io.setStore(next2);
      this.io.setDraft(text);
      this.io.onChange();
      return;
    }
    if (!isBrowsing(state)) return;
    const { state: next, restore } = retreat(state);
    event.preventDefault();
    this.io.setStore(next);
    this.io.setDraft(restore !== null ? restore : current(next) ?? "");
    this.io.onChange();
  }
};

// src/client/HistoryDock.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function loadPersisted(sessionId) {
  return { entries: loadSessionHistory(sessionId), cursor: -1, snapshot: null };
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
    let alive = true;
    pullShared(sessionId).then((remoteEntries) => {
      if (!alive || !remoteEntries || remoteEntries.length === 0) return;
      setStore((s) => {
        const next = mergeEntries(s, remoteEntries);
        if (next !== s) saveSessionHistory(sessionId, next.entries);
        return next;
      });
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
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
          saveSessionHistory(sessionId, next.entries);
          pushShared(sessionId, next.entries);
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
    const touch = isTouchDevice() ? new TouchBridge({
      getInput: () => inputRef.current ?? { draft: "", draftRev: 0, phase: "plain" },
      getStore: () => storeRef.current,
      setStore: (next) => {
        storeRef.current = next;
        setStore(next);
      },
      setDraft: (text) => actionsRef.current?.setDraft(text),
      onChange: () => setTick((t) => t + 1)
    }) : null;
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
    return () => {
      bridge.dispose();
      touch?.dispose();
    };
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
var inject = ["slots", "remote", "remote.workspaceFiles"];
function apply(ctx) {
  try {
    const ws2 = ctx["remote"];
    setWorkspaceFiles(ws2?.workspaceFiles ?? null);
  } catch {
    setWorkspaceFiles(null);
  }
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
