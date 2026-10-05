/**
 * Browser half of the input-history plugin.
 *
 * Registers the HistoryDock into the `conversation.input.dock` list slot, the
 * public extension seat above the composer card. The component receives the
 * official SessionStandardProps (useInput / inputActions) plus the InputZone
 * owner props; see docs/design.md §3.1 and §4.6.
 */
import { HistoryDock } from './HistoryDock.js';
import { setWorkspaceFiles } from './sync.js';
import type { SlotsClient } from './types.js';

/** Services this client plugin needs from the shell. */
export const inject = ['slots', 'remote', 'remote.workspaceFiles'];

/**
 * Client plugin body.
 * @param ctx - client root context (typed as SlotsClient here).
 */
export function apply(ctx: SlotsClient) {
  // Shared-history sync face: the session workspace file service, resolved
  // through the root ctx (guarded — unavailable on old hosts degrades to
  // local-only history).
  try {
    const ws = (ctx as unknown as Record<string, unknown>)['remote'] as
      | { workspaceFiles?: unknown }
      | undefined;
    setWorkspaceFiles((ws?.workspaceFiles ?? null) as never);
  } catch {
    setWorkspaceFiles(null);
  }
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.dock',
        id: 'input-history',
        order: 90,
      },
      HistoryDock,
    ),
  );
}
