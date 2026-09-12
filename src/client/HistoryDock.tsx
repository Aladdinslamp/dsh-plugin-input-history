/**
 * HistoryDock — the slot component mounted into `conversation.input.dock`.
 *
 * Renders nothing by itself (v1 is deliberately silent); it wires three
 * pieces together per Session:
 *   1. KeyBridge  — capture-phase keydown handling (see keybridge.js).
 *   2. History    — per-session entry list, observed from InputState phase
 *                   transitions and persisted to localStorage.
 *   3. Draft write-back — via the official inputActions.setDraft contract.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { emptyState, isBrowsing, position, pushEntry } from './store.js';
import { KeyBridge } from './keybridge.js';
import type { HistoryDockProps, InputState } from './types.js';

const CAP = 100;

function storageKey(sessionId: string): string {
  return `dsh-input-history:${sessionId}`;
}

function loadPersisted(sessionId: string): ReturnType<typeof emptyState> {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(sessionId));
    if (raw) {
      const entries = JSON.parse(raw) as unknown;
      if (Array.isArray(entries)) return { entries, cursor: -1, snapshot: null };
    }
  } catch {
    /* corrupted cache — start empty */
  }
  return emptyState();
}

function persist(sessionId: string, entries: readonly unknown[]): void {
  try {
    globalThis.localStorage?.setItem(storageKey(sessionId), JSON.stringify(entries));
  } catch {
    /* storage full or unavailable — history stays in memory only */
  }
}

export function HistoryDock(props: HistoryDockProps) {
  const { inputActions, session } = props;
  const sessionId = session?.sessionId ?? '';

  // Live input snapshot for the KeyBridge; updated on every render because the
  // component subscribes to the whole InputState through useInput.
  const input = props.useInput ? props.useInput((s: InputState) => s) : props.input;
  const inputRef = useRef<InputState | undefined>(input);
  inputRef.current = input;

  const [store, setStore] = useState(() => (sessionId ? loadPersisted(sessionId) : emptyState()));
  const storeRef = useRef(store);
  storeRef.current = store;

  const [, setTick] = useState(0);
  const pendingRef = useRef<string | null>(null);
  // Last submit gesture: captured draft + timestamp. DSH plain sends commit
  // optimistically (draft cleared immediately, phase may never leave
  // 'plain'), so the reliable signal is a gesture followed by the draft
  // actually clearing. Failed submissions restore the draft and are skipped.
  const gestureRef = useRef<{ text: string; at: number } | null>(null);
  const lastNonEmptyRef = useRef<string>('');

  // Reset when the session changes.
  useEffect(() => {
    setStore(sessionId ? loadPersisted(sessionId) : emptyState());
    pendingRef.current = null;
    gestureRef.current = null;
    lastNonEmptyRef.current = '';
  }, [sessionId]);

  // Capture submit gestures: plain Enter inside the composer, or a
  // pointer-down on any button within the composer card (the Send button).
  useEffect(() => {
    const capture = () => {
      const text = inputRef.current?.draft ?? '';
      if (text.trim()) gestureRef.current = { text, at: Date.now() };
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target?.closest('[data-composer-card] [contenteditable="true"], [data-composer-card] [contenteditable=""]')) return;
      capture();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target?.closest('[data-composer-card] button')) return;
      capture();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, []);

  // Commit to history: the draft was non-empty, a submit gesture preceded it,
  // and the draft has now been cleared (successful submission). Also keep the
  // phase-based capture as a secondary path for claimed/submitting flows.
  const phase = input?.phase;
  const draft = input?.draft;
  const prevDraftRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (draft === undefined) return;
    const prev = prevDraftRef.current;
    prevDraftRef.current = draft;
    if (phase !== undefined && phase !== 'plain' && draft) pendingRef.current = draft;

    const cleared = prev !== undefined && prev !== '' && draft === '';
    const captured = pendingRef.current ?? gestureRef.current?.text ?? null;
    const gestureFresh = gestureRef.current !== null && Date.now() - gestureRef.current.at < 3000;
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
    if (draft === '') {
      pendingRef.current = null;
      gestureRef.current = null;
    }
    if (draft.trim()) lastNonEmptyRef.current = draft;
  }, [phase, draft, sessionId]);

  // Wire the KeyBridge for this session's composer.
  const actionsRef = useRef(inputActions);
  actionsRef.current = inputActions;
  useEffect(() => {
    if (!inputActions) return;
    const bridge = new KeyBridge({
      getInput: () => inputRef.current ?? { draft: '', draftRev: 0, phase: 'plain' },
      getStore: () => storeRef.current,
      setStore: (next: ReturnType<typeof emptyState>) => {
        storeRef.current = next;
        setStore(next);
      },
      setDraft: (text: string) => actionsRef.current?.setDraft(text),
      onChange: () => setTick((t) => t + 1),
    });
    return () => bridge.dispose();
  }, [sessionId, Boolean(inputActions)]);

  // The "history i/n" bubble while browsing (auto-fades via CSS animation).
  const pos = position(store);
  const bubble = useMemo(() => {
    if (!pos) return null;
    return `${pos.index}/${pos.count}`;
  }, [pos]);

  if (!bubble || !isBrowsing(store)) return null;
  return (
    <div
      data-input-history-bubble=""
      style={{
        position: 'absolute',
        right: 12,
        bottom: 'calc(100% + 4px)',
        fontSize: 12,
        lineHeight: '18px',
        padding: '2px 10px',
        borderRadius: 10,
        background: 'var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.55))',
        color: 'var(--dsw-alias-label-primary, #ddd)',
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      {`历史 ${bubble}`}
    </div>
  );
}
