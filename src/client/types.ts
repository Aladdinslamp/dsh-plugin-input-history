/**
 * Minimal ambient types for the DSH client surfaces this plugin touches.
 * Kept local so the package builds standalone without depending on the
 * private type layout of any particular dsh release.
 */

export interface InputState {
  readonly draft: string;
  readonly draftRev: number;
  readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting';
}

export interface InputActions {
  setDraft(text: string): void;
}

export interface SessionSnapshotLike {
  readonly sessionId: string;
}

export interface HistoryDockProps {
  useInput?: ((selector: (s: InputState) => InputState) => InputState) | undefined;
  inputActions?: InputActions | undefined;
  session?: SessionSnapshotLike | undefined;
  input?: InputState | undefined;
}

export interface SlotsClient {
  slots: {
    inject(slot: string, factory: () => unknown): void;
    register(spec: Record<string, unknown>, component: unknown): unknown;
  };
}
