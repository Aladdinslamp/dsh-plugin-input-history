# dsh-plugin-input-history

[![npm](https://img.shields.io/npm/v/dsh-plugin-input-history)](https://www.npmjs.com/package/dsh-plugin-input-history)

为 DSH Web 对话区输入框添加「终端式历史输入」：按 **↑** 调出上一条发送过的消息，**↓** 往回翻，**Esc** 放弃并恢复原稿。

- 详细设计文档（架构、状态机、守卫规则、测试方案，含 PlantUML 图）：[`docs/design.md`](docs/design.md)
- 状态：v0.4.0 已发布 npm 与 GitHub Release，66 项单元测试全部通过

## 更新记录

### v0.4.0（2026-10-07）

- **宿主半侧落盘（核心变更）**：共享历史文件 `.input-history.json` 真正写入 DSH 会话记录目录 `~/.dsh/sessions/<工作区slug>/session-<id>/`（与 `session.v4.jsonl.zstd` 同层），跟随会话、跨设备共享；
- 宿主形态对齐官方插件：cordis function-plugin（`webServer` + `connection` 信任围栏），注册 `/input-history` 前缀路由（GET 读 / POST 写）。此前依赖的 `remote.workspaceFiles` remote 是**只读**的（官方安全模型），写盘必须发生在宿主进程内；
- 客户端三层降级：宿主路由（读写）→ workspaceFiles 只读后备 → 仅本地 localStorage；
- 安全护栏：sessionId 白名单（拒绝路径穿越）、请求体 2MB 上限、非法/空文本条目过滤、10000 条截断；
- 测试 66 项：新增宿主存储用例（目录定位/读写往返/穿越拒绝/首写建目录），sync 测试改为可注入宿主传输层。

### v0.3.0（2026-10-05）

- **跨设备同步**：历史以 `.input-history.json` 存入 DSH 会话工作区（经 `remote.workspaceFiles`），PC 与手机打开同一会话即自动并集合并——同一条对话历史不再各设备一份；
- 每会话历史上限从 100 条提升到 **10000 条**（超出覆盖最旧），存储改为 DSH 会话 ctx 规范（内存热层 + localStorage 持久层，LRU 保留 24 个会话）；
- 手机触屏手势：输入框内 **上划 = ↑**（调出上一条），**下划 = ↓**（回翻，翻过最新一条恢复空内容）；手势锁定（6px）+ `touch-action` 自适应滚动策略 + 事件吞噬，保证划动时聊天内容纹丝不动，长草稿仍可在输入框内滚动；
- 修复：重启 DSH 后会话 id 变化导致历史"失联"——自动扫描本机历史 key 合并恢复；
- 测试 59 项：纯函数核心（store/guards/sessionCtx）+ 假 DOM（touch）+ 假远程服务（sync）+ 两设备端到端同步串接。

### v0.1.1（2026-09-12）

- 已发布到 npm，支持 `dsh plugin --profile web add dsh-plugin-input-history` 一键安装；
- README 增补 npm / GitHub 双通道安装说明。

### v0.1.0（2026-09-12）

- 首个可用版本：↑ 调出 / ↓ 回翻 / Esc 恢复，G1–G5 守卫，手势式历史记录，localStorage 持久化，每会话 10000 条上限（超出覆盖最旧）；
- 实测修复：
  1. 历史记录改用「提交手势 + 草稿清空确认」——原 phase 观测方案在 DSH 乐观提交下永远等不到信号（见 design.md §10.1）；
  2. 修复 `exit()` 忘记 import 导致翻历史后按 Esc/打字即崩溃；
  3. 修复 ↓ 只移动游标、不把对应文字写回输入框；
- 补齐 bundle 包必需的 `cordis.patch.yml`（缺失会导致 `dsh web` 启动崩溃）。

## 功能

| 按键 | 行为 |
|---|---|
| `↑` | 调出上一条发送过的输入；再按继续往前翻（气泡提示「历史 i/n」） |
| `↓` | 往回翻；翻过最新一条后恢复翻历史之前你正在打的字 |
| `Esc` | 放弃翻历史，恢复原稿 |
| 任意打字 | 自动退出翻历史，保留调出的文字供你继续编辑 |
| 触屏 上划 | 等同上箭头：调出上一条 / 继续往前翻（仅手机等触屏设备） |
| 触屏 下划 | 等同下箭头：往回翻，翻过最新一条后恢复原稿 |

**绝不干扰原生行为**（守卫规则，详见 design.md §4.1）：

- 中文输入法拼字中 → 不触发
- 正在发送 / `/` 命令、`@` 引用菜单打开时 → 不触发（↑ 仍用于菜单内移动）
- 多行草稿光标不在最前面 → 不触发（↑ 仍是移动光标）
- 带修饰键（Alt/Ctrl/Meta/Shift）的组合键 → 不触发

其他行为：

- 记录机制：**提交手势**（输入框内按 Enter、或点击发送按钮）时快照草稿，**3 秒内草稿被清空**（发送成功）才入栈——发送失败（草稿被自动恢复）不会进历史；
- 连续发送相同文字只占一个历史位；
- 每个会话独立历史栈，最多 10000 条（超出覆盖最旧）；双写浏览器 `localStorage`（本机秒取）与会话目录 `.input-history.json`（跨设备共享）。
- 翻历史时附件保持原样，`setDraft` 只替换文字。

## 安装

### 从 npm 安装（推荐）

已发布到 npm，任何 DSH 用户一条命令安装：

```sh
dsh plugin --profile web add dsh-plugin-input-history

# 或固定版本
dsh plugin --profile web add dsh-plugin-input-history@0.1.0
```

CLI 会自动下载依赖、挂载 bundle，下次 `dsh web` 启动即生效。卸载：

```sh
dsh plugin --profile web remove dsh-plugin-input-history
```

### 从 GitHub 安装

```sh
dsh plugin --profile web add github:Aladdinslamp/dsh-plugin-input-history

# 固定到某个 tag
dsh plugin --profile web add github:Aladdinslamp/dsh-plugin-input-history#v0.1.0
```

### 从本地目录安装（开发者）

```sh
dsh plugin --profile web add file:<本仓库路径>
```

### 前置要求

- 已构建的 DSH（本插件基于 DSH 的 cordis 客户端插件体系）；
- 从源码构建时需要 Node.js ≥ 18。

### 开发者：自己构建

```sh
npm install
npm run build     # 产出 lib/client.js（DSH 客户端模块格式）与 lib/index.js
npm test          # 运行 20 项核心逻辑单元测试
```

### 验证挂载

启动 `dsh web` 后，三个信号说明插件已被正确加载：

1. `dsh --profile web --dump-config` 输出里能看到 `dsh-plugin-input-history`；
2. 浏览器 DevTools → Network 里出现 `/plugins` 下本包的 bundle 请求；
3. Console 无插件激活报错。

## 使用

1. 打开 DSH Web（`http://127.0.0.1:3080`），进入任意会话；
2. 发送几条消息后，把输入框清空（或把光标移到最前面），按 **↑**；
3. 输入框调出上一条消息，右上角出现「历史 1/n」气泡；
4. 继续 **↑** 往前翻、**↓** 往回翻；**Esc** 或重新打字随时退出；
5. 翻出的内容可以直接发送，也可以修改后发送。

## 目录结构

```
├── package.json            # dsh.client 声明（platform: web, inject: ["slots"]）
├── cordis.patch.yml        # 必需：bundle 包的插件行声明，缺失会导致 dsh web 启动崩溃
├── build.mjs               # esbuild 打包为 window.__ModuleLoader__ 协议格式
├── src/
│   ├── index.host.js       # 宿主侧入口（空 apply，使包出现在 Loader 中）
│   └── client/
│       ├── index.ts        # 浏览器入口：注册进 conversation.input.dock 插槽
│       ├── HistoryDock.tsx # 插槽组件：手势捕获 + 提交确认 + 持久化
│       ├── keybridge.js    # 捕获阶段键盘桥（document 级 keydown）
│       ├── store.js        # 历史栈纯函数（游标 / 快照 / 去重 / 上限）
│       ├── guards.js       # G1–G5 守卫纯函数
│       └── types.ts        # 最小化本地类型声明
└── test/                   # node:test 单元测试（20 项）
```

## 卸载

```sh
dsh plugin --profile web remove dsh-plugin-input-history
```

清理：v0.4.0 起历史落盘在 `~/.dsh/sessions/<工作区slug>/session-<id>/.input-history.json`（随会话目录删除即清）；浏览器侧缓存在 `localStorage` 的 `dsh-input-history:ctx:<sessionId>` 键下，可随手清除。

## 实测排错（踩过的坑）

| 现象 | 原因与解决 |
|---|---|
| `dsh web` 启动崩溃：`failed to read overlay ... cordis.patch.yml` | bundle 清单里有本包、但包目录缺 `cordis.patch.yml`。本仓库已自带；若是半安装状态（目录缺失/不完整），删掉 profile `node_modules` 里本包目录后重新整目录拷贝/安装 |
| 改了代码不生效 | 客户端 bundle 只在服务启动时快照——必须**重启 `dsh web`** 并强刷页面（Ctrl+F5） |
| 运行中执行 `pnpm install --force` 报 `拒绝访问 (os error 5)` | 运行中的 dsh web 锁住了已加载的原生模块。先停服务再装，或用"先删目录再整目录拷贝"的方式更新本包 |
| `package.json` 里的条目莫名消失 | 检查是否有编辑器保存了旧缓冲区（本机实测踩过一次） |
| 按键完全无反应 | F12 → Network 搜 `input-history` 确认 bundle 已加载；再查 Console 有无报错 |

## 已知限制

- 历史栈以「本会话内发送成功的消息」为准；不回溯插件安装之前的历史会话内容（v2 可经 session 历史接口做冷启动播种）；
- 鼠标点「发送」按钮的消息通过按钮 pointerdown 手势捕获；极少数不产生手势的提交路径可能漏记；
- 触发菜单是否打开依赖 `[role="listbox"]/[role="dialog"]` 的 DOM 探测（保守策略：探测不到就不拦截，宁可让位绝不吃键）。