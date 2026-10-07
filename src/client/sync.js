/**
 * sessionSync — cross-device history sync, shared file in the DSH session dir.
 *
 * History lives as one JSON file (.input-history.json) inside the session
 * record directory (~/.dsh/sessions/<workspace-slug>/session-<id>/) on the
 * server disk. DSH's workspaceFiles remote is read-only (official security
 * model), so writes go through this plugin's host half: the /input-history
 * HTTP route (same origin, connection-fenced). localStorage remains the fast
 * local layer; the file is the shared source of truth, merged in on load and
 * written (debounced by commit cadence) on every push. When the host route is
 * unavailable (older host), we degrade: workspaceFiles read-only face if
 * present, else local-only history.
 */

const HOST_ROUTE = '/input-history/file';

let ws = null;

/** Install the workspaceFiles service (read-only fallback; may stay null). */
export function setWorkspaceFiles(service) {
  ws = service ?? null;
}

function validSid(sid) {
  return typeof sid === 'string' && sid.length >= 4 && sid.length <= 80 && !/[\\/.\u0000]/.test(sid);
}

function entriesFrom(value) {
  const list = Array.isArray(value) ? value : (value && Array.isArray(value.entries) ? value.entries : null);
  return list ? list.filter((e) => e && typeof e.text === 'string') : null;
}

/* ── host-route transport (read + write) ─────────────────────────────── */

/**
 * The wire to the host half: default = same-origin fetch to /input-history/file
 * (served by this plugin's host side). Injectable so node:test can fake it.
 */
let transport = {
  read: async (sid) => {
    const res = await fetch(HOST_ROUTE + '?session=' + encodeURIComponent(sid), {
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    return res.json();
  },
  write: async (sid, body) => {
    await fetch(HOST_ROUTE + '?session=' + encodeURIComponent(sid), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  },
};

/** Test seam: replace the host-route transport (null restores the default). */
export function setHostTransport(t) {
  transport = t ?? {
    read: async () => { throw new Error('no host transport'); },
    write: async () => { throw new Error('no host transport'); },
  };
}

async function hostRead(sid) {
  if (!validSid(sid)) return null;
  try {
    return entriesFrom(await transport.read(sid));
  } catch {
    return null;
  }
}

async function hostWrite(sid, entries) {
  if (!validSid(sid)) return;
  try {
    await transport.write(sid, JSON.stringify(entries.slice(0, 10000)));
  } catch { /* best effort */ }
}

/* ── workspaceFiles read-only fallback ───────────────────────────────── */

async function wsRead(sid) {
  if (!ws || typeof ws.read !== 'function' || !validSid(sid)) return null;
  let out = '';
  for (let guard = 0; guard < 500; guard++) {
    let raw;
    try {
      raw = await ws.read(sid, '.input-history.json', { offset: out.split('\n').length });
    } catch {
      return null;
    }
    if (raw && typeof raw === 'object' && 'ok' in raw) {
      if (!raw.ok) return null; // typically: file does not exist yet
      raw = raw.value ?? raw;
    }
    const page = raw ?? {};
    out += page.text ?? '';
    if (page.eof) {
      try {
        const v = JSON.parse(out);
        return entriesFrom(v);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Pull the shared history for this session. Returns entries (possibly empty)
 * or null when every transport is unavailable — callers keep their local
 * data untouched in that case. Host route first (authoritative), then the
 * read-only workspaceFiles face.
 */
export async function pullShared(sessionId) {
  const viaHost = await hostRead(sessionId);
  if (viaHost !== null) return viaHost;
  return wsRead(sessionId);
}

/** Fire-and-forget write of the merged stack to the session dir on disk. */
export function pushShared(sessionId, entries) {
  if (!validSid(sessionId) || !Array.isArray(entries)) return;
  hostWrite(sessionId, entries); // fire-and-forget; host route is the only writer
}
