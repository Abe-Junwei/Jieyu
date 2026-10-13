---
label: wayfinder:map
issue: https://github.com/Abe-Junwei/Jieyu/issues/250
---

# 地图：解语交给语言学者试用

## Long-term destination

从田野到出版的单机闭环（用户 2026-10-13 20:08）：一个人在桌面版里完成录音、转写、标注、词典、语料库建库，再导出出版和存档格式。

- 第一程 = 本图 #250（交给语言学者试用）。
- 第二程 = [#285 下一程（试用之后）](https://github.com/Abe-Junwei/Jieyu/issues/285)。
- 语料库建库（主路线图 B5/B7）现在在路上：B5/B8 在第一程按 #265 隐藏或标实验，B7 与语料库标准格式在第二程。

## Destination

解语可以交给不懂开发的语言学者试用：在 Mac 或 Windows 上装好桌面版就能用、自己上手、靠互传项目包协作。到达时所有试用前需要拍板的问题都已定，剩下的只是去做。

## Notes

- 追踪方式：本目录 Markdown（约定见 [README](README.md)）+ GitHub issue（本图 #250，子单 #251–#284；第二程 #285（子单 #286–#303））。
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
- 2026-10-13 20:07 用户：主路线图里与试用相关的 5 条并进本图——新单 [#282](https://github.com/Abe-Junwei/Jieyu/issues/282) 桌面试用版发布检查单（门槛由用户挑）、[#283](https://github.com/Abe-Junwei/Jieyu/issues/283) 发往云端 AI 前的隐私脱敏（A9）、[#284](https://github.com/Abe-Junwei/Jieyu/issues/284) Electron e2e 冒烟调研（喂 #276）；DoD 改写并入 [#274](https://github.com/Abe-Junwei/Jieyu/issues/274) 验收与 [#278](https://github.com/Abe-Junwei/Jieyu/issues/278)，对账规则并入 #278。以后再做的条目开单放进 [#285](https://github.com/Abe-Junwei/Jieyu/issues/285)。
- 2026-10-13 20:08 用户：长期目的地 = 从田野到出版的单机闭环（见上）。
- 2026-10-13 20:16–20:23 用户拍板：
  1. 试用版默认开启 A9 出站脱敏，第一次使用 AI 时说明（关闭 [#283](https://github.com/Abe-Junwei/Jieyu/issues/283)）。
  2. 发布检查硬门槛只有三条：不丢数据（读回校验、升级前与覆盖前快照）；Mac 与 Windows 上能安装、启动、自动更新；用示例项目走通核心流程。其余只记录（[#282](https://github.com/Abe-Junwei/Jieyu/issues/282)）。
  3. 示例语料：调研 2–3 个开放许可的汉藏语系候选交用户挑（[#256](https://github.com/Abe-Junwei/Jieyu/issues/256)，调研进行中）。
  4. 存储接口按领域分仓库、暴露业务操作，不做通用表级增删改查（[#274](https://github.com/Abe-Junwei/Jieyu/issues/274)）。
  5. 用户暂不开工任何单子。
  6. 三个已评审分支正在合进 main，P2-1 分支删除（用户已同意；[#260](https://github.com/Abe-Junwei/Jieyu/issues/260) 已注明）。
  7. 最低系统版本：macOS 11+、Windows 10+；Electron 实际支持的最低 macOS 版本在 [#252](https://github.com/Abe-Junwei/Jieyu/issues/252) 核实（关闭 [#270](https://github.com/Abe-Junwei/Jieyu/issues/270)）。
  8. 项目位置：首次启动由用户选；选在百度网盘、iCloud、OneDrive 等同步文件夹里时警告（[#276](https://github.com/Abe-Junwei/Jieyu/issues/276)）。
  9. 单写者：项目文件夹里放锁文件，第二个窗口打开同一项目时提示「已在别处打开」（[#276](https://github.com/Abe-Junwei/Jieyu/issues/276)）。
  10. 导入同一 textId 的 JYM：默认导入为新项目；覆盖要二次确认，并先存覆盖前快照（[#266](https://github.com/Abe-Junwei/Jieyu/issues/266)）。
  11. 跨版本 JYM：新版应用自动升级旧包（原文件不动）；旧版应用拒绝新包并提示升级（[#266](https://github.com/Abe-Junwei/Jieyu/issues/266)、[#275](https://github.com/Abe-Junwei/Jieyu/issues/275)）。
  12. AI 服务：预置 DeepSeek 与 Qwen，另可填自定义 OpenAI 兼容地址；本阶段不接本地模型（[#257](https://github.com/Abe-Junwei/Jieyu/issues/257)）。
  13. 显示 AI token 用量；可选设每月上限，超出后停用 AI（[#257](https://github.com/Abe-Junwei/Jieyu/issues/257)）。
  14. 试用版转写走云端 OpenAI 兼容转写接口，用试用者自己的密钥；本地 Whisper 放第二程（新单 [#303](https://github.com/Abe-Junwei/Jieyu/issues/303)）。
  15. 媒体：WAV/MP3/M4A/FLAC 原样复制；支持视频，抽出音轨，音轨与原视频都存进 media/，播放与波形用音轨（[#275](https://github.com/Abe-Junwei/Jieyu/issues/275)）。
- 2026-10-13 21:06 用户拍板（模型接口，方案见 [model-interface-plan.md](model-interface-plan.md)）：
  1. `model_runs` 表在 D14 冻结前定进项目格式（[#275](https://github.com/Abe-Junwei/Jieyu/issues/275)）。
  2. [#303](https://github.com/Abe-Junwei/Jieyu/issues/303) 本地 Whisper 改为模型接口的第一个实现，用自带 whisper-server，不用 whisper.cpp 官方 `/inference`。
  3. 首片只做转写，对齐放后面。
  4. 用户模型服务不支持令牌也能接，只显示警告。
  5. 现在在 #285 下开 N1–N3 占位：[#304](https://github.com/Abe-Junwei/Jieyu/issues/304)、[#305](https://github.com/Abe-Junwei/Jieyu/issues/305)、[#306](https://github.com/Abe-Junwei/Jieyu/issues/306)。
- 新单：[#276](https://github.com/Abe-Junwei/Jieyu/issues/276) Electron 骨架范围、[#278](https://github.com/Abe-Junwei/Jieyu/issues/278) 同步主路线图 §1。

## Next leg

第二程父单 [#285](https://github.com/Abe-Junwei/Jieyu/issues/285)，子单来自主路线图中试用阶段外的条目（盒子 `/workspace/jieyu-review/MASTER_ROADMAP_MERGE.md` 的 (d) 类），每张链回原切片。试用结束前不开工。

- [#286](https://github.com/Abe-Junwei/Jieyu/issues/286) A1 ReadyWorkspace 类型合同（剩余域）
- [#287](https://github.com/Abe-Junwei/Jieyu/issues/287) A2 声学 hover readout 信息层级打磨
- [#288](https://github.com/Abe-Junwei/Jieyu/issues/288) A3 声学冻结点持久化与多点比较（冻结后需加法迁移）
- [#289](https://github.com/Abe-Junwei/Jieyu/issues/289) A4b Context JIT 默认参数与步数缩放
- [#290](https://github.com/Abe-Junwei/Jieyu/issues/290) A5 时间轴 §9 backlog（lane 行 DOM、选集撤销批处理、非线性渲染）
- [#291](https://github.com/Abe-Junwei/Jieyu/issues/291) A7 写 gate 剩余项：超 scope 写拦截与工具政策矩阵
- [#292](https://github.com/Abe-Junwei/Jieyu/issues/292) A8 agentRunId 审计链剩余项
- [#293](https://github.com/Abe-Junwei/Jieyu/issues/293) A10 Runner 基座剩余项
- [#294](https://github.com/Abe-Junwei/Jieyu/issues/294) A11 AgentUiEvent 与 Preview 放量
- [#295](https://github.com/Abe-Junwei/Jieyu/issues/295) A12 Workflow 强化剩余项
- [#296](https://github.com/Abe-Junwei/Jieyu/issues/296) A13 TaskRunner 与并行只读剩余项
- [#297](https://github.com/Abe-Junwei/Jieyu/issues/297) A14 Eval trajectory 剩余项（可选 pass@k）
- [#298](https://github.com/Abe-Junwei/Jieyu/issues/298) B7 语料库 AI（需 ChatWindow 会话隔离）
- [#299](https://github.com/Abe-Junwei/Jieyu/issues/299) 语料库接入 EAF 等标准格式
- [#300](https://github.com/Abe-Junwei/Jieyu/issues/300) 进行中 spec 复核（ai-conversation-management 等，受 AI SDK 迁移影响）
- [#301](https://github.com/Abe-Junwei/Jieyu/issues/301) C2 i18n 基线消减
- [#302](https://github.com/Abe-Junwei/Jieyu/issues/302) C3d Word/docx 导出
- [#303](https://github.com/Abe-Junwei/Jieyu/issues/303) 本地 Whisper 转写（模型接口第一个实现）
- [#304](https://github.com/Abe-Junwei/Jieyu/issues/304) N1 ADR：模型接口（转写、合同 v1、安全、model_runs）
- [#305](https://github.com/Abe-Junwei/Jieyu/issues/305) N2 主进程本机 HTTP 模型宿主（依赖 #276、#304、whisper-server 回环修复）
- [#306](https://github.com/Abe-Junwei/Jieyu/issues/306) N3 统一模型候选面板 + 模拟模型 + 自测脚本 + e2e（依赖 #305、#284）

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
