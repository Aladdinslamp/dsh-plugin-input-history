/**
 * input-history plugin, host half.
 *
 * 落盘共享层：把跨设备历史文件 .input-history.json 写进 DSH 的会话记录目录
 * (~/.dsh/sessions/<workspace-slug>/session-<id>/，与 session.v4.jsonl.zstd 同层)。
 *
 * 为什么需要宿主半侧：DSH 的 workspaceFiles remote 只读不写（官方安全模型，
 * 参见 code-viewer 宿主半侧注释），写盘必须发生在宿主进程内。插件形态对齐
 * 官方 dsh-webhook-github / dsh-host-open-in-app：
 *   - cordis function-plugin：导出 name + inject: ['webServer', 'connection'] + apply(ctx)；
 *   - 路由统一前缀 /input-history（组合级契约，避免与其它插件路由撞名）；
 *   - 每条路由先过 connection 信任围栏（Host/Origin fence + 浏览器登录态）。
 */
import { homedir } from 'node:os';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

/** cordis function-plugin 名。 */
export const name = 'input-history';
/** 路由载体 + 信任围栏：缺任一服务宿主拒绝启动（cordis 报缺失服务名）。 */
export const inject = ['webServer', 'connection'];

/** 路由命名空间。 */
const NS = '/input-history';
/** 共享历史在会话目录里的文件名。 */
export const HISTORY_FILENAME = '.input-history.json';

/** sessionId 形状白名单：session-<uuid> 或兼容短 id；杜绝路径穿越。 */
export function isValidSessionId(sid) {
  return typeof sid === 'string' && /^[A-Za-z0-9-]{8,80}$/.test(sid) && !sid.includes('..');
}

/**
 * 在 sessionsRoot 下定位某会话的目录：sessionsRoot/<workspace-slug>/session-<id>。
 * 返回绝对路径，找不到返回 null。工作区数量很少，线性扫描足够。
 */
export async function findSessionDir(sessionsRoot, sessionId) {
  if (!isValidSessionId(sessionId) || !existsSync(sessionsRoot)) return null;
  let slugs;
  try { slugs = await readdir(sessionsRoot, { withFileTypes: true }); } catch { return null; }
  for (const e of slugs) {
    if (!e.isDirectory()) continue;
    const dir = join(sessionsRoot, e.name, sessionId);
    if (existsSync(dir)) return dir;
  }
  return null;
}

/** 会话历史文件绝对路径；会话目录尚不存在时回退到第一个工作区 slug（新会话首写场景）。 */
export async function historyFilePath(sessionsRoot, sessionId) {
  const dir = await findSessionDir(sessionsRoot, sessionId);
  if (dir) return join(dir, HISTORY_FILENAME);
  let slugs;
  try { slugs = await readdir(sessionsRoot, { withFileTypes: true }); } catch { return null; }
  const first = slugs.find((e) => e.isDirectory());
  return first ? join(sessionsRoot, first.name, sessionId, HISTORY_FILENAME) : null;
}

/** 读取共享历史 JSON。文件不存在/损坏返回 null（客户端保留本地数据不动）。 */
export async function readSharedHistory(sessionsRoot, sessionId) {
  const p = await historyFilePath(sessionsRoot, sessionId);
  if (!p) return null;
  try {
    const raw = await readFile(p, 'utf8');
    const v = JSON.parse(raw);
    const list = Array.isArray(v) ? v : (v && Array.isArray(v.entries) ? v.entries : null);
    return list ? list.filter((e) => e && typeof e.text === 'string') : null;
  } catch {
    return null;
  }
}

/** 整文件覆写共享历史（条目截断到 10000，只留 {text} 合法项）。 */
export async function writeSharedHistory(sessionsRoot, sessionId, entries) {
  const p = await historyFilePath(sessionsRoot, sessionId);
  if (!p) throw new Error('session directory not found');
  const list = Array.isArray(entries)
    ? entries.filter((e) => e && typeof e.text === 'string' && e.text.trim().length > 0)
    : [];
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(list.slice(0, 10000)), 'utf8');
}

/** 统一响应：headersSent 之后绝不再写头。 */
function respondOf(res) {
  return (code, body, json = false) => {
    if (res.headersSent) { try { res.end(); } catch { /* 已关闭 */ } return; }
    try {
      res.writeHead(code, json ? { 'Content-Type': 'application/json' } : undefined);
      res.end(body);
    } catch { /* 客户端已断开 */ }
  };
}

/** 读完整请求体（上限 2MB；历史最多 10000 条远小于此）。 */
function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** 请求体解析为条目数组；不合法返回 null。 */
export function parseEntriesBody(body) {
  try {
    const v = JSON.parse(body);
    const list = Array.isArray(v) ? v : (v && Array.isArray(v.entries) ? v.entries : null);
    return list;
  } catch { return null; }
}

/** 宿主插件体：注册 /input-history 前缀路由（GET 读 / POST 写）。 */
export function apply(ctx) {
  const sessionsRoot = join(homedir(), '.dsh', 'sessions');
  ctx.webServer.register({
    kind: 'prefix',
    path: NS,
    handler: async (req, res) => {
      const respond = respondOf(res);
      const fence = ctx.connection?.requestRejection?.(req);
      if (fence !== undefined) { respond(fence, 'forbidden'); return; }
      const sid = new URL(req.url ?? '/', 'http://x').searchParams.get('session') ?? '';
      if (!isValidSessionId(sid)) { respond(400, 'bad session id'); return; }
      try {
        if (req.method === 'GET') {
          const entries = await readSharedHistory(sessionsRoot, sid);
          respond(200, JSON.stringify({ ok: true, entries }), true);
          return;
        }
        if (req.method === 'POST') {
          const body = await readBody(req);
          const entries = parseEntriesBody(body);
          if (entries === null) { respond(400, 'body must be a JSON entry array'); return; }
          await writeSharedHistory(sessionsRoot, sid, entries);
          respond(200, JSON.stringify({ ok: true }), true);
          return;
        }
        respond(405, 'method not allowed');
      } catch (err) {
        respond(500, JSON.stringify({ ok: false, error: String(err instanceof Error ? err.message : err) }), true);
      }
    },
  });
}
