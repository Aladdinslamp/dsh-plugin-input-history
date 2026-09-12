# 从零到上线：手把手教你免费发布 npm 包（含踩坑实录）

> **来源**：CSDN 博客 · [原文链接](https://blog.csdn.net/wangzhae/article/details/161033768)
> **作者**：王兆镇（wangzhaozhen2026） | 首发于 2026-05-13，修改于 2026-05-14
> **协议**：[CC 4.0 BY-SA](https://creativecommons.org/licenses/by/4.0/)，转载请保留出处与声明

> 本文记录了作者第一次将 Vue 3 组件库发布到 npm 的完整过程，包括注册、踩坑、解决报错的全流程。跟着做，10 分钟内可以发布自己的第一个 npm 包。

---

## 📖 前言

作为前端开发者，你一定用过无数个 `npm install`。但你有想过把自己写的代码也发上去让别人用吗？

很多人觉得"发布 npm 包"很遥远、很复杂——要配置各种东西、要花钱、要走一堆流程……实际操作下来，只要找对方法，真的非常简单，而且**完全免费**。

## 🎯 本文能学到什么

- ✅ 如何注册 npm 账号
- ✅ 如何初始化一个标准的 npm 包项目
- ✅ 如何打包并发布到 npm（**免费**）
- ⚠️ 发布时遇到的 **403 报错及解决方案**（含 Token 绕过方式）
- ✅ 后续如何更新版本

---

## 第一步：注册 npm 账号

**注册页面**：https://www.npmjs.com/signup

| 字段 | 说明 | 注意事项 |
|---|---|---|
| Username | 用户名 | **全局唯一**，别人用了就不能再用，也是你包的命名空间 |
| Email | 邮箱 | 用于接收验证邮件和通知 |
| Password | 密码 | 至少 8 位 |

填完后勾选验证码，点 **Create an Account**，然后去邮箱点验证链接。

> 💡 **小贴士**：用户名很重要！之后想发布作用域包（`@用户名/包名`），这个用户名就是作用域前缀。建议起一个好记且有辨识度的名字。

## 第二步：准备你的包项目

### 安装 Node.js（如果还没有）

去 https://nodejs.com 下载 LTS 版本安装。装完后确认：

```bash
node -v   # v22.x.x 或更高
npm -v    # 10.x.x 或更高
```

### 创建项目

```bash
mkdir my-npm-package
cd my-npm-package
npm init
```

按提示填写：

```
package name:    my-npm-package        # 包名（全网唯一）
version:         1.0.0                 # 初始版本
description:     一句话描述你的包
entry point:     index.js              # 入口文件
keywords:        关键词，方便搜索
author:          你的名字
license:         MIT                   # 开源协议
```

### 写你的代码

```js
// index.js
function hello(name) {
  return `Hello, ${name}! Welcome to my-npm-package.`
}

module.exports = { hello }
```

### 写 README.md

**这个非常重要！** 一个好的 README 是别人愿意使用你包的第一步。

```markdown
# my-npm-package

一句话描述你的包是干嘛的。

## 安装

npm install my-npm-package

### 使用

const { hello } = require('my-npm-package')
console.log(hello('World'))
// 输出: Hello, World! Welcome to my-npm-package.
```

---

## 第三步：本地登录 npm

```bash
npm login
```

新版 npm 会自动打开浏览器让你登录授权。登录成功后命令行会显示：

```
Logged in as 你的用户名 on https://registry.npmjs.org/
```

确认登录状态：

```bash
npm whoami
# 输出: 你的用户名
```

---

## 第四步：发布！

### 4.1 先预览一下要发布的文件

```bash
npm pack --dry-run
```

这会列出将要打包上传的所有文件，检查有没有不该出现的敏感文件。

### 4.2 正式发布

```bash
npm publish
```

看到类似下面的输出就说明成功了：

```
npm notice Publishing to https://registry.npmjs.org/
+ my-npm-package@1.0.0
```

访问 **https://www.npmjs.com/package/你的包名** 就能看到你的包了！

---

## ⚠️ 踩坑实录：403 Forbidden 报错

### 报错信息

第一次 `npm publish` 时可能遇到：

```
npm error code E403
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/real-vue3-easy-form
npm error Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
```

### 原因分析

**npm 现在强制要求发布时开启两步验证（2FA）。** 没有启用 2FA 的账号直接拒绝发布。

尝试过的弯路：

- ❌ 直接 `npm publish` → 报 403，要求 2FA
- ❌ `npm login --auth-type=legacy` → 还是要输入 OTP 验证码
- ❌ 手机上没有 Google Authenticator 等 App，无法扫码开启 2FA

> **核心矛盾**：新版 npm 不管用什么登录方式，最终都要 OTP。没有装认证 App 就陷入死循环。

### 最终解决方案：Granular Access Token（推荐！）

**不需要手机 App、全程网页操作。**

#### 第一步：在网页上生成 Token

浏览器打开（先登录 npm 账号）：

👉 `https://www.npmjs.com/settings/你的用户名/tokens`

操作步骤：

1️⃣ 点击 **Generate New Token**

2️⃣ 选择 **Granular Access Token**（细粒度访问令牌），点 Next

3️⃣ 填写 Token 配置：

| 配置项 | 填写内容 |
|---|---|
| **Token name** | `publish-token`（随便起，方便识别） |
| **Expiration** | 90 天（或按需） |
| **Packages and scopes** | **Read and write**（读写权限） |
| **Organizations** | "Only select organizations and scopes" |

4️⃣ ⚠️ **最关键的一步：勾选 Bypass 2FA**

```
☑️ Bypass two-factor authentication for automation
```

**必须勾选！** 勾选后这个 Token 可以绕过两步验证，否则发布时还是会要求输验证码。

5️⃣ 点击 **Generate Token** 生成令牌

6️⃣ **立即复制保存 Token 字符串！** 页面关闭后就再也看不到完整 Token 了。

#### 第二步：把 Token 写进 npm 配置（不用 npm login）

```bash
npm config set //registry.npmjs.org/:_authToken "你的Token粘贴到这里"
```

这相当于把认证信息直接写入 npm 配置文件，之后所有发布操作自动带上 Token，**不需要再走 npm login 流程**。

#### 第三步：直接发布

```bash
npm publish
```

这次没有任何验证码提示，直接成功 🎉

### 为什么推荐 Token 方案？

| 方案 | 需要手机 App？ | 操作难度 | 适合场景 |
|---|---|---|---|
| 开启 2FA + 每次输验证码 | ✅ 需要 | 简单 | 个人偶尔发布 |
| **Granular Access Token + Bypass 2FA** | ❌ 不需要 | **简单** | **个人 / CI / 自动化** |
| CI/CD Trusted Publishing | ❌ 不需要 | 复杂 | GitHub Actions 等流水线 |

**Token 方案的优势**：

- 🚫 不需要安装任何手机 App
- 🌐 全程网页操作，几分钟搞定
- 🤖 适合自动化，CI/CD 可以用同一个 Token
- ♻️ 有效期可控，90 天到期重新生成

---

## 第五步：更新已发布的包

### 5.1 升级版本号

```bash
npm version patch    # 1.0.0 → 1.0.1  小修复（修 bug）
npm version minor    # 1.0.0 → 1.1.0  新功能（向后兼容）
npm version major    # 1.0.0 → 2.0.0  大改版（不兼容旧版）
```

### 5.2 重新发布

```bash
npm publish
```

> ⚠️ **注意**：同一版本号不能重复发布！每次 `npm publish` 前必须先升级版本号。

---

## 📋 完整命令速查表

```bash
# ===== 准备阶段 =====
node -v && npm -v                    # 检查环境
npm init                             # 初始化项目
npm login                            # 登录 npm（可选，Token 方式可跳过）
npm whoami                           # 确认登录状态

# ===== 开发阶段 =====
npm run build                        # 构建代码（如果有构建步骤）
npm pack --dry-run                   # 预览要发布的文件

# ===== Token 配置（绕过 2FA，推荐）=====
npm config set //registry.npmjs.org/:_authToken "你的Token"

# ===== 发布阶段 =====
npm publish                          # 发布无作用域包
npm publish --access public          # 发布作用域公开包（免费！）

# ===== 更新阶段 =====
npm version patch && npm publish     # 升补丁版本 + 发布
npm version minor && npm publish     # 升次版本 + 发布
npm version major && npm publish     # 升主版本 + 发布
```

---

## 💡 几个重要的知识点

### 公开 vs 私有——这决定了是否收费

| 类型 | 命令 | 是否收费 |
|---|---|---|
| 无作用域公开包 | `npm publish` | ✅ **免费** |
| 作用域公开包 | `npm publish --access public` | ✅ **免费** |
| 作用域私有包 | `npm publish`（不加 --access） | ❌ **收费** |

> 🔑 **记住**：作用域包（`@xxx/包名`）默认是私有的！必须加 `--access public` 才能免费发布，否则会变成付费的私有包。

### 包名规则

- 无作用域包：全网唯一，先到先得
- 作用域包：`@用户名/包名`，不怕和别人重名
- 名字只能包含小写字母、数字、连字符（`-`）、下划线（`_`）
- 不能以 `.` 或 `_` 开头

### 关于 Token 安全

- Token 相当于你的"发布密码"，**不要提交到 Git 仓库**
- 建议将 `.npmrc` 加入 `.gitignore`
- Token 有过期时间，到期后需要重新生成
- 如果怀疑 Token 泄露，立即去网页上撤销

---

## 🎉 总结

核心步骤就这几步：

```
注册账号 → 准备项目 → 网页生成 Token → 命令行配置 Token → npm publish
```

从决定发布到成功上线，全程不到 20 分钟（包括解决 403 报错的时间）。最大的坑就是 **403 Forbidden**，知道用 Token 绕过后就一帆风顺了。

---

*—— 以上内容整理自 CSDN 博主 wangzhaozhen2026 的原创文章，遵循 CC 4.0 BY-SA 协议。*
*原文：https://blog.csdn.net/wangzhae/article/details/161033768*
