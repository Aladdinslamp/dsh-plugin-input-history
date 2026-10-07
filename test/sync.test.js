import test from 'node:test';
import assert from 'node:assert/strict';

// ---- sessionSync (sync.js): host-route transport + workspaceFiles fallback ----

import { setWorkspaceFiles, setHostTransport, pullShared, pushShared } from '../src/client/sync.js';

/** Fake the host half's /input-history/file route backed by one shared string. */
function fakeHost(store = { file: null }, log = []) {
  return {
    read: async (sid) => {
      log.push(['read', sid]);
      if (store.file === null) throw new Error('404');
      return JSON.parse(store.file);
    },
    write: async (sid, body) => {
      log.push(['write', sid, body]);
      store.file = body;
    },
  };
}

function fakeWs(pages, log = []) {
  let call = 0;
  return {
    read: async (sid, path, opts) => {
      log.push(['read', sid, path, opts]);
      const page = pages[Math.min(call, pages.length - 1)];
      call++;
      return { ok: true, value: page };
    },
    write: async (sid, path, content) => {
      log.push(['write', sid, path, content]);
    },
  };
}

test('sync: host route returns the shared entries', async () => {
  const store = { file: JSON.stringify([{ text: 'a', seq: 1 }]) };
  setHostTransport(fakeHost(store));
  const entries = await pullShared('sess-1');
  assert.deepEqual(entries.map((e) => e.text), ['a']);
  setHostTransport(null);
});

test('sync: host route failure falls back to workspaceFiles multi-page read', async () => {
  setHostTransport(null); // default fetch fails (no server in node:test) → fallback
  const log = [];
  setWorkspaceFiles(fakeWs([
    { text: '{"entries":', eof: false },
    { text: '[{"text":"a"', eof: false },
    { text: ',"seq":1}]}', eof: true },
  ], log));
  const entries = await pullShared('sess-2');
  assert.deepEqual(entries.map((e) => e.text), ['a']);
  assert.equal(log[0][2], '.input-history.json');
  assert.equal(log[0][3].offset, 1); // first line offset starts at 1
  assert.equal(log[1][3].offset, 1); // single-line file: still line 1 next round
});

test('sync: RemoteResult ok:false (file absent) yields null, not a throw', async () => {
  setWorkspaceFiles({ read: async () => ({ ok: false, error: { message: 'not found' } }) });
  assert.equal(await pullShared('sess-3'), null);
});

test('sync: corrupted JSON yields null', async () => {
  setWorkspaceFiles(fakeWs([{ text: '{oops', eof: true }]));
  assert.equal(await pullShared('sess-4'), null);
});

test('sync: no service installed yields null (local-only degradation)', async () => {
  setWorkspaceFiles(null);
  assert.equal(await pullShared('sess-5'), null);
});

test('sync: pushShared writes capped JSON body through the host route', async () => {
  const log = [];
  setHostTransport(fakeHost({ file: null }, log));
  const entries = [{ text: 'one', seq: 1 }, { text: 'two', seq: 2 }];
  pushShared('sess-6', entries);
  await new Promise((r) => setTimeout(r, 0)); // fire-and-forget: let the microtask land
  assert.deepEqual(log[0], ['write', 'sess-6', JSON.stringify(entries)]);
  setHostTransport(null);
});

test('sync: pushShared swallows transport rejections (best effort)', async () => {
  setHostTransport({ read: async () => { throw new Error('x'); }, write: async () => { throw new Error('disk full'); } });
  assert.doesNotThrow(() => pushShared('sess-7', []));
  await new Promise((r) => setTimeout(r, 0));
  setHostTransport(null);
});

test('sync: pushShared without a session id is a no-op', async () => {
  const log = [];
  setHostTransport(fakeHost({ file: null }, log));
  pushShared('', [{ text: 'x', seq: 1 }]);
  pushShared('../evil', [{ text: 'x', seq: 1 }]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(log.length, 0);
  setHostTransport(null);
});

// ---- end-to-end: two devices sync through one session file ----

test('E2E: device B pulls what device A pushed, then merges its own', async () => {
  // Host side: one shared file on disk, seen by both devices.
  const store = { file: null };

  // Device A: local entry pushed to the session file.
  setHostTransport(fakeHost(store));
  const aEntries = [{ text: 'from pc', seq: 1000 }];
  pushShared('sess-shared', aEntries);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(store.file !== null);

  // Device B (phone): pulls, merges with its own local entries.
  const pulled = await pullShared('sess-shared');
  assert.deepEqual(pulled.map((e) => e.text), ['from pc']);
  const { mergeEntries } = await import('../src/client/store.js');
  let bState = { entries: [{ text: 'from phone', seq: 1001 }], cursor: -1, snapshot: null };
  bState = mergeEntries(bState, pulled);
  assert.deepEqual(bState.entries.map((e) => e.text), ['from phone', 'from pc']);

  // Device B pushes back; device A can now see both.
  pushShared('sess-shared', bState.entries);
  await new Promise((r) => setTimeout(r, 0));
  const backOnA = await pullShared('sess-shared');
  assert.deepEqual(backOnA.map((e) => e.text), ['from phone', 'from pc']);
  setHostTransport(null);
});
