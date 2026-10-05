/**
 * sessionSync — cross-device history sync over the DSH session workspace.
 *
 * History lives as one JSON file (`.input-history.json`) inside the session
 * workspace on the server disk, written through the `remote.workspaceFiles`
 * service (same face code-viewer uses for .rlp/envelopes.jsonl). Every device
 * that opens the session reads the same file, so the stack follows the
 * session instead of the browser. localStorage remains the fast local layer;
 * the file is the shared source of truth, merged in on load and written
 * (debounced) on every commit.
 */

const PATH = '.input-history.json';

let ws = null;

/** Install the workspaceFiles service (called once from the client apply). */
export function setWorkspaceFiles(service) {
  ws = service ?? null;
}

/** Reads the whole file via the line-paged remote face. Null = absent/broken. */
async function readWhole(sid) {
  if (!ws || typeof ws.read !== 'function' || !sid) return null;
  let out = '';
  for (let guard = 0; guard < 500; guard++) {
    let raw;
    try {
      raw = await ws.read(sid, PATH, { offset: out.split('\n').length });
    } catch {
      return null;
    }
    if (raw && typeof raw === 'object' && 'ok' in raw) {
      if (!(raw).ok) return null; // typically: file does not exist yet
      raw = raw.value ?? raw;
    }
    const page = raw ?? {};
    out += page.text ?? '';
    if (page.eof) {
      try {
        const v = JSON.parse(out);
        const list = Array.isArray(v) ? v : (v && Array.isArray(v.entries) ? v.entries : null);
        return list ? list.filter((e) => e && typeof e.text === 'string') : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Pull the shared history for this session. Returns entries (possibly empty)
 * or null when the service/file is unavailable — callers keep their local
 * data untouched in that case.
 */
export async function pullShared(sessionId) {
  return readWhole(sessionId);
}

/** Fire-and-forget write of the merged stack to the session workspace. */
export function pushShared(sessionId, entries) {
  if (!ws || typeof ws.write !== 'function' || !sessionId) return;
  const body = JSON.stringify(Array.isArray(entries) ? entries.slice(0, 10000) : []);
  ws.write(sessionId, PATH, body).catch(() => { /* best effort */ });
}
