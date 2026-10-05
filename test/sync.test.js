import test from 'node:test';
import assert from 'node:assert/strict';


// ---- sessionSync (sync.js) — fake workspaceFiles service ----

import { setWorkspaceFiles, pullShared, pushShared } from '../src/client/sync.js';

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

test('sync: multi-page reads concatenate until eof and parse JSON', async () => {
  const log = [];
  setWorkspaceFiles(fakeWs([
    { text: '{"entries":', eof: false },
    { text: '[{"text":"a"', eof: false },
    { text: ',"seq":1}]}', eof: true },
  ], log));
  const entries = await pullShared('sess-1');
  assert.deepEqual(entries.map((e) => e.text), ['a']);
  assert.equal(log[0][1], 'sess-1');
  assert.equal(log[0][2], '.input-history.json');
  assert.equal(log[0][3].offset, 1); // first line offset starts at 1
  assert.equal(log[1][3].offset, 1); // single-line file: still line 1 next round
});

test('sync: RemoteResult ok:false (file absent) yields null, not a throw', async () => {
  setWorkspaceFiles({ read: async () => ({ ok: false, error: { message: 'not found' } }) });
  assert.equal(await pullShared('sess-2'), null);
});

test('sync: corrupted JSON yields null', async () => {
  setWorkspaceFiles(fakeWs([{ text: '{oops', eof: true }]));
  assert.equal(await pullShared('sess-3'), null);
});

test('sync: no service installed yields null (local-only degradation)', async () => {
  setWorkspaceFiles(null);
  assert.equal(await pullShared('sess-4'), null);
});

test('sync: pushShared writes capped JSON body through the service', async () => {
  const log = [];
  const entries = [{ text: 'one', seq: 1 }, { text: 'two', seq: 2 }];
  setWorkspaceFiles({ read: async () => ({ ok: true, value: { text: '', eof: true } }), write: async (sid, path, body) => { log.push([sid, path, body]); } });
  pushShared('sess-5', entries);
  await new Promise((r) => setTimeout(r, 0)); // fire-and-forget: let the microtask land
  assert.deepEqual(log[0], ['sess-5', '.input-history.json', JSON.stringify(entries)]);
});

test('sync: pushShared swallows write rejections (best effort)', async () => {
  setWorkspaceFiles({ write: async () => { throw new Error('disk full'); } });
  assert.doesNotThrow(() => pushShared('sess-6', []));
  await new Promise((r) => setTimeout(r, 0));
});

test('sync: pushShared without a session id is a no-op', async () => {
  const log = [];
  setWorkspaceFiles({ write: async (...a) => { log.push(a); } });
  pushShared('', [{ text: 'x', seq: 1 }]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(log.length, 0);
});


// ---- end-to-end: two devices sync through one session file ----

test('E2E: device B pulls what device A pushed, then merges its own', async () => {
  // Server side: one shared file in the session workspace.
  let file = null;
  const wsA = { read: async () => (file === null ? { ok: false } : { ok: true, value: { text: file, eof: true } }), write: async (_s, _p, body) => { file = body; } };
  const wsB = { read: async () => (file === null ? { ok: false } : { ok: true, value: { text: file, eof: true } }), write: async (_s, _p, body) => { file = body; } };

  // Device A: local entry pushed to the session file.
  setWorkspaceFiles(wsA);
  const aEntries = [{ text: 'from pc', seq: 1000 }];
  pushShared('sess-shared', aEntries);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(file !== null);

  // Device B (phone): pulls, merges with its own local entries.
  setWorkspaceFiles(wsB);
  const pulled = await pullShared('sess-shared');
  assert.deepEqual(pulled.map((e) => e.text), ['from pc']);
  const { mergeEntries } = await import('../src/client/store.js');
  let bState = { entries: [{ text: 'from phone', seq: 1001 }], cursor: -1, snapshot: null };
  bState = mergeEntries(bState, pulled);
  assert.deepEqual(bState.entries.map((e) => e.text), ['from phone', 'from pc']);

  // Device B pushes back; device A can now see both.
  pushShared('sess-shared', bState.entries);
  await new Promise((r) => setTimeout(r, 0));
  setWorkspaceFiles(wsA);
  const backOnA = await pullShared('sess-shared');
  assert.deepEqual(backOnA.map((e) => e.text), ['from phone', 'from pc']);
});
