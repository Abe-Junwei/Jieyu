# 调研 #252 / #284（2026-10-14，只读）

基线：`main` 在派单时是 `bb99d681`，现在已到 `3d86c79d`（解语修bug 已把 `feat/ai-runtime-r1-toolloop` 合进 main，AI runtime v2 默认关）。

## #252 Electron 事实清单

| 问题 | 事实 | 来源 |
|---|---|---|
| 当前版本 | 受支持的是 42/43/44；最新 44.7.0（2026-10-07，Node 24.18）；42 于 2026-10-20 停止支持；8 周一个大版本 | endoflife.date/electron |
| **最低 macOS** | Electron 38 起要 macOS 12；**44 起要 macOS 13**。还在支持期内的版本都不能跑 macOS 11 | electronjs.org/blog/electron-38-0；electron v44.0.0 release notes |
| 32 位 | 44 删了 Windows ia32，只出 x64/arm64 | v44.0.0 notes |
| SQLite 驱动 | `node:sqlite` 内置（Electron ≥37.2.3 可用），Node 文档标为 Stability 1.2 RC，没有 `.transaction()` helper；better-sqlite3 13.0.3（2026-08）成熟，但需要 @electron/rebuild、asar 解包，每个 Electron 大版本都要重编 | releases.electronjs.org/pr/47756；nodejs.org/api/sqlite；whoooop.co.uk；vite discussion #19278 |
| wa-sqlite/OPFS | 跑在渲染进程，和“项目文件夹放在磁盘上、可互传”冲突，文件在 OPFS 里用户看不到；只适合当浏览器构建的备选 | 推断（ADR-0046） |
| 自动更新 | electron-updater 支持未签名的 NSIS，要设 `verifyUpdateCodeSignature=false`（这样就失去了防篡改校验）；首次安装会弹 SmartScreen “仍要运行”，EV 证书也不能马上免弹；Mac 必须签名公证，否则更新失败 | electron.build/docs/win；crawlix.app 2026；zenn.dev |
| 钥匙串 | keytar 已停维；用 Electron `safeStorage` 加密后落盘（Mac 用 Keychain，Win 用 DPAPI） | freek.dev；Electron safeStorage 文档 |
| 主进程 AI 流式 | 常用 `MessagePort`（`webContents.postMessage`）或按 chunk 发 `webContents.send` 加上 requestId/abort；渲染进程不碰密钥 | Electron IPC 文档（常规做法，待 #276 骨架实测） |
| 大音频 | 用 `protocol.handle` 自定义协议（如 `jieyu-media://`）流式返回文件，要支持 Range，wavesurfer 直接用这个 URL；不要经 IPC 传整个 buffer | Electron protocol 文档（待实测 Range/seek） |
| Windows 中文输入法 | 没找到 2026 年的阻断性问题；按惯例在 Win11 微软拼音下实测 composition 事件（波形快捷键和输入法会抢键） | 待 #276 实测 |
| 包体 | Electron 本体 zip 每个平台约 105–110 MB，加 ffmpeg（LGPL）和应用，安装包估计 130–180 MB | electron v38.8.6 release 资产 |
| 公证进 CI | electron-builder 的 notarize 用 App Store Connect API key（GitHub Secrets）；Apple Developer 年费 99 美元 | electron.build 文档（常识，未重新核实价格） |

**建议**：Electron 44（以后跟着最新的两个大版本走）+ electron-builder（NSIS + dmg/zip）+ electron-updater（GitHub Releases）+ safeStorage + `protocol.handle` 媒体协议。SQLite 驱动见决策 2。

## #284 Electron 下的 e2e

| 问题 | 事实 | 来源 |
|---|---|---|
| Playwright `_electron` | 仍标 experimental，支持 Electron v21+；`electronApp.evaluate()` 能在主进程里执行代码；**原生 dialog 拦不到**，要在 evaluate 里替换 `dialog.showOpenDialog`；不能关掉 `EnableNodeCliInspectArguments` fuse（发布版想关就得测试构建和发布构建分开） | playwright.dev/docs/api/class-electron |
| Linux CI | 要 `xvfb-run`；Ubuntu 24.04 还要 `sysctl kernel.apparmor_restrict_unprivileged_userns=0`，否则报 “Process failed to launch” | playwright #34251；meguri test.yml |
| mac/Win CI | 不需要 xvfb，可以直接跑；成本高（macOS runner 按 10 倍分钟计费） | GitHub Actions 计费（常识） |
| 主进程测试 | 用 `ELECTRON_RUN_AS_NODE` 跑 vitest，加载 Electron ABI 的 better-sqlite3；选 node:sqlite 就能直接用普通 Node 跑 | meguri test.yml |
| 耗时 | 冒烟级（启动、打开项目、导入、保存、重开）每条 10–30 秒；现有 92 条 chromium e2e 继续对浏览器构建跑 | 估计 |

**建议**：保留 `test:e2e:chromium`（浏览器构建，IndexedDB 实现）作为主回归。另加 `test:e2e:electron` 冒烟 5–8 条，PR 上只在 Linux+xvfb 跑；mac/Win 只在打 tag 发版时跑。#276 的骨架验收 = Electron 冒烟在 Linux CI 全绿 + mac/Win 手测清单。

## 对 #274 / #275 / #276 的影响
- **#274 存储接口**：接口要异步、按业务操作划分（getX/putX/事务），不能暴露 Dexie 的 `where().equals()` 或 `db.table(name)`，否则 SQLite 实现会被迫模拟 Dexie。事务语义按 SQLite 的来（同步事务包在一次 IPC 调用里），不要让渲染进程跨多次 IPC 持有事务。
- **#275 SQLite**：放在主进程（或 utilityProcess），用 WAL 和 foreign_keys；渲染进程通过 preload 暴露的 IPC 调用；数据格式版本用 `PRAGMA user_version` 或 meta 表里的整数；升级前先复制项目文件夹（#277）。
- **#276 骨架**：Electron 44、`protocol.handle` 媒体、safeStorage、主进程 AI 流式，再加上面的 e2e 冒烟。
- **model_runs / provenance**：在 SQLite 里建普通表，`modelRunId` 设外键；loopback 模型 HTTP 也从主进程发，和 AI 请求走同一个通道。

## ⚠️ 要标出来的：解语修bug 的分支（已合进 main 3d86c79d）
- `src/db/aiRuntimeV2TurnStore.ts`（fa4a4245）**方向对**，只暴露业务操作 get/put/delete/sweep/fingerprint，符合 #274。但它的实现里有 `fingerprintTarget` 用 `db.table(name)` 按**任意表名**读、用 Dexie 的 `where('unitId').equals()`。要换 SQLite 实现，表名得有白名单并映射到 SQL，不然就只能拼字符串。建议 #274 把“可做指纹的目标类型”写成枚举。
- `src/db/auditLogStore.ts` 用的是 `getDb()` 加 `db.collections.audit_logs.insert`，这是旧的 collections 封装，和 TurnStore 的 `db` 直连不是一套风格。两个都在 `src/db` 里面，所以不算进那 297 个直连，但它们说明 `src/db` 里面还没有统一的 port。建议 #274 定一种风格，这两个文件列进 #280 最后的 AI 批。
- 直连数从 299 降到 297，基线没变；守卫有效。

## 待你拍板（每条附建议）
1. **最低 macOS**：#270 定的是 macOS 11+，但还在支持期的 Electron 都不支持 11，44 起要 13。→ **建议改成 macOS 13+，用 Electron 44**（为了 12 锁在 43，2027-01 就停止支持了）。
2. **SQLite 驱动**：node:sqlite（零原生依赖，RC，没有 transaction helper）还是 better-sqlite3（成熟，要 rebuild 加 asar 解包）？→ **建议 node:sqlite**，自己写一个 BEGIN/COMMIT 的 helper，放在 #275 的驱动适配层后面，以后要换 better-sqlite3 也只改这一层。
3. **Windows 未签名更新**：接受 `verifyUpdateCodeSignature=false`（没有防篡改校验）？→ **建议接受**，靠 GitHub Releases 的 HTTPS 加 sha512（electron-updater 自带）兜底，在试用说明里写清楚 SmartScreen 怎么点过去。
4. **Electron e2e 范围**：→ **建议**：PR 上只跑 Linux+xvfb 冒烟 5–8 条，mac/Win 只在发版时跑，浏览器 chromium 套件继续当主回归。
5. **#274 接口风格**：→ **建议**按业务操作的异步 port（参照 TurnStore），禁止 `db.table(name)` 和泛型查询；`auditLogStore` 统一到同一种风格。

未实测：输入法、媒体 Range、IPC 流式，都放进 #276 骨架验收。
