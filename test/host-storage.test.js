import test from 'node:test';
import assert from 'assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isValidSessionId,
  findSessionDir,
  historyFilePath,
  readSharedHistory,
  writeSharedHistory,
  parseEntriesBody,
  HISTORY_FILENAME,
} from '../src/index.host.js';

test('sessionId 白名单：合法 uuid 通过，穿越/异常形状拒绝', () => {
  assert.equal(isValidSessionId('session-9f4b004e-9d5c-45d1-93c8-fd370c7c22e8'), true);
  assert.equal(isValidSessionId('../../etc'), false);
  assert.equal(isValidSessionId('..'), false);
  assert.equal(isValidSessionId('short'), false);
  assert.equal(isValidSessionId(''), false);
  assert.equal(isValidSessionId(null), false);
  assert.equal(isValidSessionId('has.dot.9'), false);
});

test('findSessionDir 在工作区 slug 下定位会话目录', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-ih-'));
  await mkdir(join(root, '--E-prog-demo--', 'session-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), { recursive: true });
  const dir = await findSessionDir(root, 'session-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert.equal(dir, join(root, '--E-prog-demo--', 'session-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
  assert.equal(await findSessionDir(root, 'session-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), null);
  assert.equal(await findSessionDir(root, '../../x'), null);
});

test('writeSharedHistory / readSharedHistory 往返，且过滤非法条目', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-ih-'));
  const sid = 'session-cccccccc-cccc-cccc-cccc-cccccccccccc';
  await mkdir(join(root, '--W--', sid), { recursive: true });
  await writeSharedHistory(root, sid, [
    { text: 'hello', seq: 1 },
    { text: '', seq: 2 },        // 空文本被滤掉
    null,                        // 非法项被滤掉
    { text: '世界', seq: 3 },
  ]);
  const raw = JSON.parse(await readFile(join(root, '--W--', sid, HISTORY_FILENAME), 'utf8'));
  assert.deepEqual(raw.map((e) => e.text), ['hello', '世界']);
  const back = await readSharedHistory(root, sid);
  assert.deepEqual(back.map((e) => e.text), ['hello', '世界']);
});

test('readSharedHistory：文件缺失/损坏返回 null', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-ih-'));
  const sid = 'session-dddddddd-dddd-dddd-dddd-dddddddddddd';
  await mkdir(join(root, '--W--', sid), { recursive: true });
  assert.equal(await readSharedHistory(root, sid), null);
  await writeFile(join(root, '--W--', sid, HISTORY_FILENAME), '{broken');
  assert.equal(await readSharedHistory(root, sid), null);
});

test('writeSharedHistory 可为首写自动建目录（新会话回退 slug）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-ih-'));
  await mkdir(join(root, '--Only--'), { recursive: true });
  const sid = 'session-eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  await writeSharedHistory(root, sid, [{ text: 'first', seq: 1 }]);
  const p = await historyFilePath(root, sid);
  assert.equal(p, join(root, '--Only--', sid, HISTORY_FILENAME));
  assert.deepEqual(await readSharedHistory(root, sid), [{ text: 'first', seq: 1 }]);
});

test('parseEntriesBody 接受数组或 {entries} 包装，其余拒绝', () => {
  assert.deepEqual(parseEntriesBody('[{"text":"a"}]'), [{ text: 'a' }]);
  assert.deepEqual(parseEntriesBody('{"entries":[{"text":"b"}]}'), [{ text: 'b' }]);
  assert.equal(parseEntriesBody('not json'), null);
  assert.equal(parseEntriesBody('{"foo":1}'), null);
});
