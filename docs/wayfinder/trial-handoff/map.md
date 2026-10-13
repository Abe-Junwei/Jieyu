---
label: wayfinder:map
issue: https://github.com/Abe-Junwei/Jieyu/issues/250
---

# 地图：解语交给语言学者试用

## Destination

解语可以交给不懂开发的语言学者试用：在 Mac 或 Windows 上装好桌面版就能用、自己上手、靠互传项目包协作。到达时所有试用前需要拍板的问题都已定，剩下的只是去做。

## Notes

- 追踪方式：本目录 Markdown（约定见 [README](README.md)）+ GitHub issue（本图 #250，子单 #251–#281）。
- 全局排期真源是 [主路线图](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/execution/plans/%E8%A7%A3%E8%AF%AD-%E4%B8%BB%E8%B7%AF%E7%BA%BF%E5%9B%BE-master-roadmap-2026-06-01.md)。本图只管「交给试用者」这一程；与主路线图重叠的单子在各自 Related 里链到原条目（C1 对外前最小检查、C2 i18n、batch4a/4b 记录）。主路线图里没有与本图重复的 GitHub issue。
- 已定（用户 2026-10-13）：
  - 分发：桌面外壳（Electron）。19:11 改定，取代 18:54 的「本地运行、浏览器打开」。Mac 与 Windows 都要能跑。
  - 协作：只靠互传项目包 JYM/JYT，不做实时同步。
  - AI：试用者自己填云端模型 API 密钥（DeepSeek、Qwen 等），不附带本地模型。
  - 按 D14，交给非开发者即 schema 冻结点。
- 输入：盒子 `/workspace/jieyu-review/RESEARCH_DISTRIBUTION.md`（本地运行网页应用的同类调研，C 只作对照，#252 补全）。
- 背景：AI SDK 迁移由「解语修bug」在 `feat/ai-runtime-r1-toolloop` 进行；三个已评审修复待合：`fix/p1-2-undo-collab`、`fix/p2-3-adapter-indexed`、`fix/ws8x1-e2e-region-wait`。
- 默认只做决策，不做实现。代码改动遵守 ponytail 原则。

## Decisions so far

- 2026-10-13 19:11 用户：直接走桌面外壳（C）。关闭 [#267](https://github.com/Abe-Junwei/Jieyu/issues/267)、[#268](https://github.com/Abe-Junwei/Jieyu/issues/268)（并入 #252）、[#273](https://github.com/Abe-Junwei/Jieyu/issues/273)（并入 #269）；重开 #251–#254。
- 2026-10-13 19:21–19:26 用户拍板：
  1. 项目数据存在磁盘上的项目文件夹（关闭 [#269](https://github.com/Abe-Junwei/Jieyu/issues/269)）。
  2. ~~文件夹格式 = 解包后的 JYM 目录结构~~（19:51 被 SQLite 取代，见下），IndexedDB 只当缓存（新单 [#275](https://github.com/Abe-Junwei/Jieyu/issues/275)）。
  3. 外壳 = Electron（关闭 [#251](https://github.com/Abe-Junwei/Jieyu/issues/251)；[#252](https://github.com/Abe-Junwei/Jieyu/issues/252) 改为 Electron 事实清单）。
  4. Mac 签名并公证，Windows 暂不签名（关闭 [#253](https://github.com/Abe-Junwei/Jieyu/issues/253)）。
  5. electron-updater 走 GitHub Releases 自动更新；数据格式升级前自动备份项目文件夹（关闭 [#254](https://github.com/Abe-Junwei/Jieyu/issues/254)、[#271](https://github.com/Abe-Junwei/Jieyu/issues/271)；落地见新单 [#277](https://github.com/Abe-Junwei/Jieyu/issues/277)）。
  6. API 密钥存系统钥匙串，AI 请求从 Electron 主进程发出（[#257](https://github.com/Abe-Junwei/Jieyu/issues/257) 缩为密钥界面；[#272](https://github.com/Abe-Junwei/Jieyu/issues/272) 按不再需要关闭）。
  7. 保留浏览器构建供开发与测试；存储层放在接口后，磁盘与 IndexedDB 两种实现（新单 [#274](https://github.com/Abe-Junwei/Jieyu/issues/274)）。
  8. D14 冻结的是磁盘项目文件夹格式，在第一个试用版发布之前（[#259](https://github.com/Abe-Junwei/Jieyu/issues/259) 改为冻结前清单）。
  9. 试用版只做中文界面，保留 i18n 结构（关闭 [#262](https://github.com/Abe-Junwei/Jieyu/issues/262)）。
  10. 试用版只露核心流程：导入录音、切分/标注、词库、导出 EAF/JYM、AI 辅助；其余隐藏或标实验（[#265](https://github.com/Abe-Junwei/Jieyu/issues/265) 转为盘点任务）。
  11. 内置示例项目，用现成的开放许可语料（[#256](https://github.com/Abe-Junwei/Jieyu/issues/256) 转为找语料的调研）。
  12. 崩溃上报：试用者选择开启的自动上报（如 Sentry），按主路线图 C1 脱敏（关闭 [#261](https://github.com/Abe-Junwei/Jieyu/issues/261)）。
  13. 试用名单与节奏由用户本人决定，不进路线图（关闭 [#264](https://github.com/Abe-Junwei/Jieyu/issues/264)）。
  14. 用户手册：图文中文快速上手，应用内帮助 + PDF（[#263](https://github.com/Abe-Junwei/Jieyu/issues/263) 转为任务）。
- 2026-10-13 19:33–19:51 用户拍板（grill-with-docs；写成 [ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/docs/wayfinder-trial-map/docs/adr/0046-desktop-sqlite-project-folder.md)、[ADR-0047](https://github.com/Abe-Junwei/Jieyu/blob/docs/wayfinder-trial-map/docs/adr/0047-desktop-build-strips-collab-keys-telemetry.md)，术语见 [GLOSSARY](https://github.com/Abe-Junwei/Jieyu/blob/docs/wayfinder-trial-map/docs/GLOSSARY.md)）：
  0. 用户没有需要保留的真实数据；D14 未触发，基线仍可重置。
  1. **取代上面第 2 条**：桌面版规范存储 = SQLite，项目文件夹 = `project.sqlite` + `media/`。JYM/JYT 仍是 JSON 交换包，导出导入时互转。磁盘不加密（加密 JYM 只用于导出）。（[#275](https://github.com/Abe-Junwei/Jieyu/issues/275) 改为表结构）
  2. 存储层方案 B：统一存储接口；桌面实现 = 主进程 SQLite（如 better-sqlite3），浏览器构建 = Dexie；约 297 个直连 db 模块分批迁移，新代码必须走接口。（[#274](https://github.com/Abe-Junwei/Jieyu/issues/274)、新单 [#280](https://github.com/Abe-Junwei/Jieyu/issues/280)）
  3. 术语：项目 = `textId` = 一个项目文件夹；项目包 = JYM/JYT，只用于交换与归档；文稿 = 项目内的标注文档；工作区只指界面布局。
  4. 两层：项目内容在项目文件夹；偏好、缓存、可重建索引在 Electron `userData`；8 个 IndexedDB 库逐库归层；ADR-0044 全局 ID 覆盖行改为项目所有。（新单 [#279](https://github.com/Abe-Junwei/Jieyu/issues/279)）
  5. 桌面版每个项目每天一份 JYM 快照，保留 3 份，加格式升级前快照；JYB 只在浏览器构建。（[#258](https://github.com/Abe-Junwei/Jieyu/issues/258)）
  6. 导入的媒体一律复制进 `media/`；冻结前不新增 `byteLocation` 取值。
  7. 覆盖前、升级前快照与恢复导出放 `userData/backups/<项目>/`，不互传；照搬写入后读回校验。
  8. 桌面构建编译期剔除协作 / Supabase 代码，磁盘格式不含协作字段；试用项目一律视为从未协作，覆盖导入始终允许（先存覆盖前快照）。（[#276](https://github.com/Abe-Junwei/Jieyu/issues/276)）
  9. 试用版开放多文稿（用户否决隐藏建议）；保留 `documents[]`；资料组 / 访问级别以后用加法迁移加入；冻结前演练一次加法迁移。（[#265](https://github.com/Abe-Junwei/Jieyu/issues/265)、新单 [#281](https://github.com/Abe-Junwei/Jieyu/issues/281)）
  10. keyVault 只在浏览器构建；偏好备份不含密钥；桌面渲染进程 CSP `connect-src` 只放行本地来源。（[#257](https://github.com/Abe-Junwei/Jieyu/issues/257)、[#276](https://github.com/Abe-Junwei/Jieyu/issues/276)）
  11. Sentry：首启同意弹窗、默认关；`@sentry/electron` 接渲染与主进程；强制 `sendDefaultPii=false`、字段白名单；用用户本人的 Sentry 账户与 DSN。（[#261](https://github.com/Abe-Junwei/Jieyu/issues/261) 决定已补全）
  12. 文档：D14 原文保留，补「冻结对象 = 项目文件夹格式（SQLite + media/）」；[#278](https://github.com/Abe-Junwei/Jieyu/issues/278) 改主路线图 §1 与浏览器支持策略。
- 新单：[#276](https://github.com/Abe-Junwei/Jieyu/issues/276) Electron 骨架范围、[#278](https://github.com/Abe-Junwei/Jieyu/issues/278) 同步主路线图 §1。

## Not yet specified

- 与主路线图冲突：§1 North Star 写着「纯 Web 应用、非 WebView」、数据真源是浏览器 IndexedDB，与 ADR-0046 冲突（浏览器支持策略也要改），待按 [#278](https://github.com/Abe-Junwei/Jieyu/issues/278) 改。
- 多台电脑：同一试用者换设备时项目文件夹怎么迁（拷文件夹还是导出 JYM）。
- 冻结之后的迁移演练：试用期间若必须改结构，升级路径如何验证。
- 试用者隐私与伦理：录音数据不出本机的承诺怎么写（与崩溃上报、AI 调用相关）。
- 性能底线：试用者常见电脑上的大录音/长项目表现。
- 试用结束后的去向：数据保留与转正式版。

## Out of scope

- 本地启动器 + 浏览器打开的路线（原 A/B）：用户改走桌面外壳。
- 远程托管网站、域名、国内访问与备案：用户明确不设服务器。
- 实时同步 / Supabase 云协作：只靠项目包互传（主路线图 C4 另行推进，不在这一程）。
- 附带或推荐本地模型（WebLLM、Ollama）：用自填云端密钥。
- 移动端。
- 试用名单与节奏：用户本人安排。
- Tauri：已选 Electron。
