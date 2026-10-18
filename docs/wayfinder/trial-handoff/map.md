---
label: wayfinder:map
issue: https://github.com/Abe-Junwei/Jieyu/issues/250
---

# 地图：解语交给语言学者试用

> 当前桌面存储决定见 [ADR 当前有效条款](../../adr/README.md#桌面存储当前有效条款)：项目文件夹布局以 ADR-0061 为准，不再是下方历史记录中的 `project.sqlite` + `media/`；ADR-0046 的交换包与每日 JYM 备份仍有效。D14 尚未冻结。本机已导入的录音不能按历史上的「没有需要保留的真实数据」直接丢弃。一份文稿同时只关联一条音频，父子链接不能跨文稿。冻结前仍需含音频备份的恢复播放及桌面写路径验证。

## Long-term destination

从田野到出版的单机闭环（用户 2026-10-13 20:08）：一个人在桌面版里完成录音、转写、标注、词典、语料库建库，再导出出版和存档格式。

- 第一程 = 本图 #250（交给语言学者试用）。
- 第二程 = [#285 下一程（试用之后）](https://github.com/Abe-Junwei/Jieyu/issues/285)。
- 语料库建库（主路线图 B5/B7）现在在路上：B5 语料库页 2026-10-13 起默认开（含试用，只露当前文本浏览、临时工作集、文本导出；导航说明已改为如实描述），B8 仍按 #265 隐藏或标实验，B7 与语料库标准格式在第二程。

## Destination

解语可以交给不懂开发的语言学者试用：在 Mac 或 Windows 上装好桌面版就能用、自己上手、靠互传项目包协作。到达时所有试用前需要拍板的问题都已定，剩下的只是去做。

## Notes

- 追踪方式：本目录 Markdown（约定见 [README](README.md)）+ GitHub issue（本图 #250，子单 #251–#284、#303–#307（本地 035–039）、#312（本地 040）、#313（本地 041）、#325、#326（本地 043、044）、#327 已关闭、#328（本地 045）、#329（本地 046）；第二程 #285（子单 #286–#302、#308–#311、#314–#317））。
- 全局排期真源是 [主路线图](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/execution/plans/%E8%A7%A3%E8%AF%AD-%E4%B8%BB%E8%B7%AF%E7%BA%BF%E5%9B%BE-master-roadmap-2026-06-01.md)。本图只管「交给试用者」这一程；与主路线图重叠的单子在各自 Related 里链到原条目（C1 对外前最小检查、C2 i18n、batch4a/4b 记录）。主路线图里没有与本图重复的 GitHub issue。
- 已定（用户 2026-10-13）：
  - 分发：桌面外壳（Electron）。19:11 改定，取代 18:54 的「本地运行、浏览器打开」。Mac 与 Windows 都要能跑。
  - 协作：只靠互传项目包 JYM/JYT，不做实时同步。
  - AI：不附带、不推荐通用大模型（WebLLM、Ollama）；AI 对话与分析用试用者自填的云端密钥（DeepSeek、Qwen 等）。本机语音转写例外：随包带 `whisper-cli`，模型权重在应用内下载（2026-10-14 改）。
  - 按 D14，交给非开发者即 schema 冻结点。
- 输入：盒子 `/workspace/jieyu-review/RESEARCH_DISTRIBUTION.md`（本地运行网页应用的同类调研，C 只作对照，#252 补全）。
- ~~背景：AI SDK 迁移……三个已评审修复待合~~（已合进 main）。代码改动遵守 ponytail 原则；决策与实现并行（#274/#280 已开工）。

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
  11. 内置示例项目（[#256](https://github.com/Abe-Junwei/Jieyu/issues/256) 调研；2026-10-14 改用木雅语公开示例，见 [#313](https://github.com/Abe-Junwei/Jieyu/issues/313)）。
  12. 崩溃上报：试用者选择开启的自动上报（如 Sentry），按主路线图 C1 脱敏（关闭 [#261](https://github.com/Abe-Junwei/Jieyu/issues/261)）。
  13. 试用名单与节奏由用户本人决定，不进路线图（关闭 [#264](https://github.com/Abe-Junwei/Jieyu/issues/264)）。
  14. 用户手册：图文中文快速上手，应用内帮助 + PDF（[#263](https://github.com/Abe-Junwei/Jieyu/issues/263) 转为任务）。
- 2026-10-13 19:33–19:51 用户拍板（grill-with-docs；写成 [ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0046-desktop-sqlite-project-folder.md)、[ADR-0047](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0047-desktop-build-strips-collab-keys-telemetry.md)，术语见 [术语表](../../architecture/术语表.md)）：
  0. 用户没有需要保留的真实数据；D14 未触发，基线仍可重置。
  1. **取代上面第 2 条**：桌面版规范存储 = SQLite，项目文件夹 = `project.sqlite` + `media/`。JYM/JYT 仍是 JSON 交换包，导出导入时互转。磁盘不加密（加密 JYM 只用于导出）。（[#275](https://github.com/Abe-Junwei/Jieyu/issues/275) 改为表结构）
  2. 存储层方案 B：统一存储接口；桌面实现 = 主进程 SQLite（如 better-sqlite3），浏览器构建 = Dexie；约 297 个直连 db 模块分批迁移，新代码必须走接口。（[#274](https://github.com/Abe-Junwei/Jieyu/issues/274)、新单 [#280](https://github.com/Abe-Junwei/Jieyu/issues/280)）
  3. 术语：项目 = `textId` = 一个项目文件夹；项目包 = JYM/JYT，只用于交换与归档；文稿 = 项目内的标注文档；工作区只指界面布局。
  4. 两层：项目内容在项目文件夹；偏好、缓存、可重建索引在 Electron `userData`；8 个 IndexedDB 库逐库归层；ADR-0044 全局 ID 覆盖行改为项目所有。（新单 [#279](https://github.com/Abe-Junwei/Jieyu/issues/279)）
  5. 桌面版每个项目每天一份 JYM 快照，保留 3 份，加格式升级前快照；JYB 只在浏览器构建（2026-10-16 ADR-0062 第 6 条放宽：桌面端接受一次 JYB 导入，用于旧库迁入 [#326](https://github.com/Abe-Junwei/Jieyu/issues/326)）。（[#258](https://github.com/Abe-Junwei/Jieyu/issues/258)）
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
  3. ~~示例语料：调研 2–3 个汉藏语系候选~~（21:18 第 4 条曾定撒都话；2026-10-14 改用木雅语，见 [#313](https://github.com/Abe-Junwei/Jieyu/issues/313)）。
  4. 存储接口按领域分仓库、暴露业务操作，不做通用表级增删改查（[#274](https://github.com/Abe-Junwei/Jieyu/issues/274)）。
  5. ~~用户暂不开工任何单子。~~（已被取代：21:20 第 8 条排了开工顺序，#274 已在 main 上开工。）
  6. 三个已评审分支正在合进 main，P2-1 分支删除（用户已同意；[#260](https://github.com/Abe-Junwei/Jieyu/issues/260) 已注明）。
  7. ~~最低系统版本：macOS 11+、Windows 10+~~（2026-10-14 被取代：macOS 13+、Windows 10+，见下）（[#270](https://github.com/Abe-Junwei/Jieyu/issues/270)）。
  8. 项目位置：首次启动由用户选；选在百度网盘、iCloud、OneDrive 等同步文件夹里时警告（[#276](https://github.com/Abe-Junwei/Jieyu/issues/276)）。
  9. 单写者：项目文件夹里放锁文件，第二个窗口打开同一项目时提示「已在别处打开」（[#276](https://github.com/Abe-Junwei/Jieyu/issues/276)）。
  10. 导入同一 textId 的 JYM：默认导入为新项目；覆盖要二次确认，并先存覆盖前快照（[#266](https://github.com/Abe-Junwei/Jieyu/issues/266)）。
  11. 跨版本 JYM：新版应用自动升级旧包（原文件不动）；旧版应用拒绝新包并提示升级（[#266](https://github.com/Abe-Junwei/Jieyu/issues/266)、[#275](https://github.com/Abe-Junwei/Jieyu/issues/275)）。
  12. AI 服务：预置 DeepSeek 与 Qwen，另可填自定义 OpenAI 兼容地址；本阶段不接本地模型（[#257](https://github.com/Abe-Junwei/Jieyu/issues/257)）。
  13. 显示 AI token 用量；可选设每月上限，超出后停用 AI（[#257](https://github.com/Abe-Junwei/Jieyu/issues/257)）。
  14. 试用版转写走云端 OpenAI 兼容转写接口，用试用者自己的密钥；~~本地 Whisper 放第二程~~（新单 [#303](https://github.com/Abe-Junwei/Jieyu/issues/303)；21:16 第 7 条已改为本机与云端都保留，#303 在第一程）。
  15. 媒体：WAV/MP3/M4A/FLAC 原样复制；支持视频，抽出音轨，音轨与原视频都存进 media/，播放与波形用音轨（[#275](https://github.com/Abe-Junwei/Jieyu/issues/275)）。
- 2026-10-13 21:06 用户拍板（模型接口，方案见 [model-interface-plan.md](model-interface-plan.md)）：
  1. `model_runs` 表在 D14 冻结前定进项目格式（[#275](https://github.com/Abe-Junwei/Jieyu/issues/275)）。
  2. [#303](https://github.com/Abe-Junwei/Jieyu/issues/303) 本地 Whisper 改为模型接口的第一个实现，用自带 whisper-server，不用 whisper.cpp 官方 `/inference`。
  3. 首片只做转写，对齐放后面。
  4. 用户模型服务不支持令牌也能接，只显示警告。
  5. 现在在 #285 下开 N1–N3 占位：[#304](https://github.com/Abe-Junwei/Jieyu/issues/304)、[#305](https://github.com/Abe-Junwei/Jieyu/issues/305)、[#306](https://github.com/Abe-Junwei/Jieyu/issues/306)。
- 2026-10-13 21:14–21:17 用户拍板（路线图拷问）：
  1. `model_runs` 每次运行记一行；语段 `provenance.params.modelRunId` 指向它（[#275](https://github.com/Abe-Junwei/Jieyu/issues/275)、[#304](https://github.com/Abe-Junwei/Jieyu/issues/304)、[#306](https://github.com/Abe-Junwei/Jieyu/issues/306)）。
  2. D14 冻结门槛：约 297 个直连数据库的模块**全部**迁到存储接口后才冻结（不只是格式定稿）（[#259](https://github.com/Abe-Junwei/Jieyu/issues/259)、[#274](https://github.com/Abe-Junwei/Jieyu/issues/274)、[#280](https://github.com/Abe-Junwei/Jieyu/issues/280)）。
  3. 视频抽音轨：随包带 LGPL 版 ffmpeg，音轨统一存 WAV（[#275](https://github.com/Abe-Junwei/Jieyu/issues/275)、[#276](https://github.com/Abe-Junwei/Jieyu/issues/276)、[#277](https://github.com/Abe-Junwei/Jieyu/issues/277)）。
  4. `provenance` 枚举与 `params` 键名随 D14 一起冻结（[#275](https://github.com/Abe-Junwei/Jieyu/issues/275)）。
  5. 冻结前加项目元数据、发音人、知情同意、许可证空表，字段参照 IMDI/OLAC（[#275](https://github.com/Abe-Junwei/Jieyu/issues/275)、[#281](https://github.com/Abe-Junwei/Jieyu/issues/281)）。
  6. 冻结后每次格式迁移带一个旧版测试项目，迁移后核对，列为发布硬门槛（[#281](https://github.com/Abe-Junwei/Jieyu/issues/281) 演练、[#282](https://github.com/Abe-Junwei/Jieyu/issues/282) 发布检查单）。
  7. 试用版本机与云端转写都保留；[#303](https://github.com/Abe-Junwei/Jieyu/issues/303) 提到第一程，试用版正式支持本机转写（覆盖上面第 14 条“本地 Whisper 放第二程”）。
  8. [#304](https://github.com/Abe-Junwei/Jieyu/issues/304)–[#306](https://github.com/Abe-Junwei/Jieyu/issues/306) 与 #303 一起提到第一程（改挂 #250）。
  9. 桌面版功能开关固定用 prod 环境，另加一份试用白名单（[#265](https://github.com/Abe-Junwei/Jieyu/issues/265)）。
  10. 现在做 [#278](https://github.com/Abe-Junwei/Jieyu/issues/278)，更新主路线图。
- 2026-10-13 21:18–21:20 用户拍板（路线图拷问，续）：
  1. 应用内反馈按钮打开邮件，预填版本、系统与脱敏日志（[#264](https://github.com/Abe-Junwei/Jieyu/issues/264)）。
  2. 应用版本从 0.x 起，走 beta 渠道；数据格式版本另用一个整数（[#271](https://github.com/Abe-Junwei/Jieyu/issues/271)、[#275](https://github.com/Abe-Junwei/Jieyu/issues/275)）。
  3. 解语改用 GPL-3.0-or-later（现为 ISC，著作权人沂南灵创技术服务中心）；暂不改 LICENSE/package.json，由新单 [#307](https://github.com/Abe-Junwei/Jieyu/issues/307) 负责许可切换、依赖兼容核对、安装包第三方许可清单、中文隐私说明。
  4. ~~示例语料：撒都话（Sadu，CC BY 4.0）~~（2026-10-14 被木雅语公开示例取代，见 [#313](https://github.com/Abe-Junwei/Jieyu/issues/313)）。
  5. 数据恢复：应用内导出诊断包；用户自己从快照恢复（[#269](https://github.com/Abe-Junwei/Jieyu/issues/269)）。
  6. 首次用云端转写弹专门的伦理/隐私对话框；可按项目关闭云端转写（[#257](https://github.com/Abe-Junwei/Jieyu/issues/257)、[#283](https://github.com/Abe-Junwei/Jieyu/issues/283)）。
  7. 手册写明换电脑靠导出 JYM；性能只记录不设门槛，用一段 2 小时录音实测（[#263](https://github.com/Abe-Junwei/Jieyu/issues/263)）。
  8. 顺序：先做调研 [#252](https://github.com/Abe-Junwei/Jieyu/issues/252)、[#284](https://github.com/Abe-Junwei/Jieyu/issues/284)，再把 [#276](https://github.com/Abe-Junwei/Jieyu/issues/276)+[#274](https://github.com/Abe-Junwei/Jieyu/issues/274)+[#275](https://github.com/Abe-Junwei/Jieyu/issues/275) 作为一个里程碑。
- 2026-10-13 21:21–21:23 用户拍板（第二程与收尾）：
  1. 第二程做应用内简单录音（单声道 WAV + 元数据）：[#308](https://github.com/Abe-Junwei/Jieyu/issues/308)。
  2. 出版格式先完善 Leipzig 隔行注释导出（LaTeX gb4e/expex + HTML），在 C3c 之上：[#309](https://github.com/Abe-Junwei/Jieyu/issues/309)；[#302](https://github.com/Abe-Junwei/Jieyu/issues/302) Word 仍不排期。
  3. 存档包导出（媒体 + EAF + LIFT + 元数据 XML，IMDI/CMDI/OLAC）：[#310](https://github.com/Abe-Junwei/Jieyu/issues/310)，依赖冻结前元数据表。
  4. 词典用 FLEx 做 LIFT 往返验证：[#311](https://github.com/Abe-Junwei/Jieyu/issues/311)。
  5. 第二程按页面闭环排：先词典页闭环，再语料库页闭环；A 系列 AI 打磨（#286–#297）按需再做。缺口清单见盒子 `/workspace/jieyu-review/PAGE_LOOP_GAPS.md`。
  6. 训练集导出：知情同意只提示，不强制数据卡；沿用缺授权记录的说话人默认不导出、可覆盖并记日志（[#304](https://github.com/Abe-Junwei/Jieyu/issues/304)、[model-interface-plan](model-interface-plan.md)）。
  7. 语言学者试用告一段落之后的衔接与收费：以后再定。
  8. 补 #278：rev5 方案 D14 处注明冻结对象 = 项目文件夹格式（SQLite + media/）。
- 新单：[#276](https://github.com/Abe-Junwei/Jieyu/issues/276) Electron 骨架范围、[#278](https://github.com/Abe-Junwei/Jieyu/issues/278) 同步主路线图 §1。
- 2026-10-14 用户（#252/#284 调研拍板，报告见 [research/RESEARCH_252_284.md](research/RESEARCH_252_284.md)）：
  1. 最低 macOS 13，Electron 44（取代 #270 的 macOS 11+）；Windows 10+。
  2. SQLite 驱动 = better-sqlite3（不用 node:sqlite），放主进程，界面经 IPC 调用；随 Electron 升级的原生模块重建在打包流程处理（[#275](https://github.com/Abe-Junwei/Jieyu/issues/275)、[#276](https://github.com/Abe-Junwei/Jieyu/issues/276)）。
  3. Windows 不签名的自动更新：关闭签名校验，依靠 HTTPS + electron-updater sha512；试用手册说明 SmartScreen（[#276](https://github.com/Abe-Junwei/Jieyu/issues/276)、[#282](https://github.com/Abe-Junwei/Jieyu/issues/282)）。API 密钥用 Electron safeStorage。
  4. e2e：浏览器 e2e 仍是主回归；另加 5–8 条 Electron 冒烟，每个 PR 在 Linux、macOS、Windows 三平台跑（[#284](https://github.com/Abe-Junwei/Jieyu/issues/284)、[#276](https://github.com/Abe-Junwei/Jieyu/issues/276)）。
  5. [#274](https://github.com/Abe-Junwei/Jieyu/issues/274) 存储接口只暴露业务操作方法，禁止任意表名与泛型查询；auditLogStore 与 aiRuntimeV2TurnStore 的 fingerprint 统一走该接口。
- 2026-10-14 用户（路线图拷问）：
  1. [#303](https://github.com/Abe-Junwei/Jieyu/issues/303)–[#306](https://github.com/Abe-Junwei/Jieyu/issues/306) 全部挡首个试用版，首发即带本机转写。
  2. Whisper 权重不进安装包：首次使用时应用内下载，sha256 校验后存 `userData/models/`；默认推荐 small，可选 base。
  3. 权重下载源：GitHub Releases 为主，失败依次退 Hugging Face、hf-mirror.com，同一 sha256。
  4. `whisper-cli` 随安装包带各平台预编译版，与应用一起签名公证；引入第二个大体积引擎时改成可下载的模型包（[#305](https://github.com/Abe-Junwei/Jieyu/issues/305)）。
  5. 首发只出 Apple 芯片 Mac 与 Windows x64。
  6. Windows 只带 CPU 版 `whisper-cli`，默认 base，长录音提示可改云端；Vulkan 版按试用反馈再加（[#305](https://github.com/Abe-Junwei/Jieyu/issues/305)）。
  7. 「不附带本地模型」收窄为不附带通用大模型，本机语音转写例外（见 Notes、Out of scope）。
  8. 新单 [#312](https://github.com/Abe-Junwei/Jieyu/issues/312) 诊断与反馈（反馈邮件按钮、诊断包导出、Sentry），依赖 #276；Sentry 从 #276 移过去。
  9. 反馈按钮与诊断包导出挡首发，写进 [#282](https://github.com/Abe-Junwei/Jieyu/issues/282)「不丢数据」验收项；Sentry 不挡。
  10. whisper-server 只监听本机的修复已合进 main（`bb5fb2a4`）；Origin 校验与回环 IP 判定留给 [#303](https://github.com/Abe-Junwei/Jieyu/issues/303)。
  11. 维持「297 个模块全部迁完才冻结」；[#259](https://github.com/Abe-Junwei/Jieyu/issues/259) 依赖补 #280、#304，[#275](https://github.com/Abe-Junwei/Jieyu/issues/275) 依赖补 #304。
  12. 本地单子只补第一程（035–040）；第二程开工前只放 GitHub（见 [README](README.md)）。
  13. 链接统一改指 `blob/main/`，之后删除 `docs/wayfinder-trial-map` 分支。
- 2026-10-14 用户（路线图审查拷问，第二轮）：
  1. [#280](https://github.com/Abe-Junwei/Jieyu/issues/280) 改成「计划 + 逐批执行」；每批一 PR，基线降到 0（或只剩写明白名单的接口实现模块）时关闭。
  2. [#274](https://github.com/Abe-Junwei/Jieyu/issues/274) 交付 ADR-0048 存储接口（事务、归属校验侧、IPC 粒度、异步约定；样例 `aiRuntimeV2TurnStore`）。ADR 确认前 #280 只迁不涉及事务的纯读模块。2026-10-15：接口与 Dexie 样例在 `src/db/storagePort.ts`，用户已确认 ADR；SQLite 实现仍是 #275。
  3. 公开示例改用木雅语料，取代撒都话；关闭 [#256](https://github.com/Abe-Junwei/Jieyu/issues/256)，新单 [#313](https://github.com/Abe-Junwei/Jieyu/issues/313)。
  4. 发音人知情同意已覆盖公开发布；元数据留「授权记录」字段由用户填写。
  5. 示例数据许可证 = CC BY 4.0。
  6. 示例放 GitHub Releases 资产 `sample-muya-v*`，构建时下载并校验 sha256；录音不进 git。
  7. 内置形式 = JYM 项目包，用户在解语里制作并导出；首启自动导入（依赖 #255、#275）。
  8. 两处 `supermemory-agent-memory.mdc`：木雅语料只留在本机，唯一例外为授权示例片段；代理仍不读、不上传、不粘贴任何木雅语料内容。
  9. 插件与扩展不做：不做到扩展中心，也不开放第三方插件。《插件系统与扩展生态落地方案》就此停止。已在仓库里的扩展运行时不因此删除。
- 2026-10-15 用户：AI 架构迁移拍进第二程 [#314](https://github.com/Abe-Junwei/Jieyu/issues/314)。只做 ToolLoopAgent 有限试点，不批准全面迁移；R1 不达标再限时对照 OpenAI Agents SDK。不进第一程。`aiAgentRuntimeV2Enabled` 达标前不默认打开。门槛留在迁移评估，不另写切片。
- 2026-10-15 用户：[#314](https://github.com/Abe-Junwei/Jieyu/issues/314) 的 R0/R1 提前，与第一程 #274、#304、#279 并行，独立分支，不挡试用关键路径。R2 进 main 须试点达标且用户确认，不进试用版默认路径。父单仍是 #285。全面迁移仍不批准。
- 2026-10-15 用户：语言学只读分析是主路线图 **B16**、第二程 [#315](https://github.com/Abe-Junwei/Jieyu/issues/315)。第一程（#250）做完再开工，flag 默认关。不并进 A15，不把本机 Ollama 或自训模型设为默认。对话仍用自填云端密钥。
- 2026-10-15 用户：B16 的模型输出结构化主张，引用工具结果行 id，代码核对后渲染成可复制正文。发给云端模型的只有 gloss 标签、词类、次数和行 id，不含词形和转写；例句本机填回。文献摘录是 **B17**、[#316](https://github.com/Abe-Junwei/Jieyu/issues/316)，排在 B16 之后，只在桌面版，由主进程 stdio 拉起本机检索。引文关系不作为语法事实。不设写作工作区。
- 2026-10-15 用户：词形和转写可以发给用户自选的云端模型，以便分析词形本身（取代上一条的「云端只见抽象标签」，外发仍过 A9）。B17 放宽为外部证据源：本机文献、网页检索、语料资源都接 MCP；网页检索走 MCP 搜索服务，不用模型供应商自带的联网搜索。
- 2026-10-15 用户：智能体多步循环只走 A15 的 Vercel AI SDK ToolLoopAgent。B16/B17 的查询、核对、证据映射仍是领域代码；工具结果回到模型再写下一轮，不在 `agentLoopRunner` 上补。取代同日「不并进 A15」把循环留在旧运行时的写法。本机模型仍不设为默认。
- 2026-10-15 用户：智能体路线统一到主路线图 §2.2.0 与 [ADR-0056](../../adr/0056-single-agent-runtime-toolloopagent.md)。运行时只有 ToolLoopAgent，旧循环冻结并由 architecture guard 锁行数。核对 main：R1/R2 代码已在 main、flag 关，用户追认留在 main；B16/B17 端到端分别等 R3-1、R3-2；评审的领域修复是 D1–D6。
- 2026-10-16：文件夹内容布局以 [ADR-0061](../../adr/0061-jyd-manuscript-file-audio-stays-plain.md) 为准，取代 2026-10-13「项目文件夹 = `project.sqlite` + `media/`」和同日「冻结对象 = SQLite + media/」。ADR-0046 的交换包与每日 JYM 备份仍然有效，整篇不标 superseded。哪一条算数见 [ADR 目录](../../adr/README.md)。D14 尚未冻结。一份文稿同时只关联一条音频，可以改挂到另一条，但不能同时挂两条；父子链接不能跨文稿。冻结前要有格式原型、含音频的备份恢复并播放、桌面写路径验证。上面第 0 条「没有需要保留的真实数据」不再作为丢弃本机已导入录音的依据。
- 2026-10-16 用户：桌面存储剩下的事整体排一次，顺序写进主路线图 §3。新单 [#327](https://github.com/Abe-Junwei/Jieyu/issues/327)（本地 042）浏览器保存路径接上一文稿一条录音、不存跨文稿关系，现在就能做；[#325](https://github.com/Abe-Junwei/Jieyu/issues/325)（043）桌面文件操作，等 #276、#275；[#326](https://github.com/Abe-Junwei/Jieyu/issues/326)（044）旧浏览器库经 JYB 迁入，等 #275、#325。没写完的列形状并进 #275，含音频备份的恢复演练并进 #258，D14 冻结（#259）补挂 #258、#325。
- 2026-10-17 用户：旧浏览器库迁入（#326）挡首个试用版，归 [#282](https://github.com/Abe-Junwei/Jieyu/issues/282)「不丢数据」硬门槛。
- 2026-10-17 用户：Electron 骨架（#276）跑通后只做桌面版，浏览器构建只留作开发与测试（[ADR-0063](../../adr/0063-desktop-only-after-electron-skeleton.md)）。[#327](https://github.com/Abe-Junwei/Jieyu/issues/327) 不在浏览器上做，关闭，要求并进 #275、#325；浏览器里的 JYB 导出留到 #326 完成。新单 [#328](https://github.com/Abe-Junwei/Jieyu/issues/328)（本地 045）在 #276 之后撤掉浏览器支持承诺。
- 2026-10-17 用户（grill-with-docs，写成 [ADR-0064](../../adr/0064-storage-freeze-until-desktop-opens-real-projects.md)）：从现在冻结新功能，到 #275 与 #325 都落地才解冻；冻结期只做 #276、#275、#280、#325 和新单 [#329](https://github.com/Abe-Junwei/Jieyu/issues/329)（本地 046，E2E 迁到 Electron），另外只修 bug。#303–#306、#312、#313 排到解冻后（035、037、038、040、041 补挂 025、043）。#275 之后只写 SQLite 实现；#329 与 #326 完成后删浏览器构建和 Dexie。协作代码保留等 C4；桌面已有替代的浏览器专用代码随浏览器构建删除，其余由用户逐项定。
- 2026-10-17 用户（grill）：[#276](https://github.com/Abe-Junwei/Jieyu/issues/276)（026）改为实现单，按 ADR-0059 写骨架并验收。开工前批准 better-sqlite3。[#313](https://github.com/Abe-Junwei/Jieyu/issues/313)（041）的 A 是用户本人做的 JYM，不受冻结，代理不读语料；整张单仍被 #275、#325 挡住，B 等解冻。
- 2026-10-17 主路线图全文对账：顺序改为先 #276，再 #275 与 #280；D14（#259）只等存储几步与 #258、#281，不等首发功能单；首发 [#282](https://github.com/Abe-Junwei/Jieyu/issues/282)（032）补挂 D14 与 035、037、038、040、041；发布流水线 [#277](https://github.com/Abe-Junwei/Jieyu/issues/277)（027）排到解冻后。只出决定、调研、原型、文档的单子不受冻结。[#274](https://github.com/Abe-Junwei/Jieyu/issues/274)（ADR-0048）、[#279](https://github.com/Abe-Junwei/Jieyu/issues/279)（ADR-0058）、[#304](https://github.com/Abe-Junwei/Jieyu/issues/304)（ADR-0057）已落成，关闭，本地 024、029、036 删除。
- 2026-10-18：[#276](https://github.com/Abe-Junwei/Jieyu/issues/276) Electron 骨架落地（[#331](https://github.com/Abe-Junwei/Jieyu/pull/331)）。三平台烟测覆盖启动、选项目文件夹、同步盘警告、第二窗口被锁挡住、一次 `project.sqlite` 写入读回、主进程带密钥的出站请求（渲染进程看不到明文）、媒体 Range。浏览器端到端仍是主回归。协作编译期剔除留给 [#328](https://github.com/Abe-Junwei/Jieyu/issues/328)。本地 026 删除。

## Next leg

第二程父单 [#285](https://github.com/Abe-Junwei/Jieyu/issues/285)，子单来自主路线图中试用阶段外的条目（盒子 `/workspace/jieyu-review/MASTER_ROADMAP_MERGE.md` 的 (d) 类），每张链回原切片。第一程（#250）做完再开工。

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
- （#303–#306 已于 2026-10-13 提到第一程，见 Decisions 21:14–21:17 第 7–8 条。）
- [#308](https://github.com/Abe-Junwei/Jieyu/issues/308) 应用内简单录音（单声道 WAV + 元数据）
- [#309](https://github.com/Abe-Junwei/Jieyu/issues/309) 完善 Leipzig IGT 导出（gb4e/expex + HTML）
- [#310](https://github.com/Abe-Junwei/Jieyu/issues/310) 存档包导出（媒体 + EAF + LIFT + 元数据 XML）
- [#311](https://github.com/Abe-Junwei/Jieyu/issues/311) FLEx LIFT 往返验证
- [#314](https://github.com/Abe-Junwei/Jieyu/issues/314) A15 AI 运行时（Vercel AI SDK ToolLoopAgent；新的多步循环只接这里，含 B16/B17 的工具结果回模型；不扩展旧 `agentLoopRunner`；R2 不进试用版默认路径；v2 不默认打开）
- [#315](https://github.com/Abe-Junwei/Jieyu/issues/315) B16a 语言学只读查询工具（领域工具已落地，flag 默认关；多步循环归 #314）
- [#317](https://github.com/Abe-Junwei/Jieyu/issues/317) B16b 分析正文（主张核对已落地，flag 默认关；词形可发用户自选云端模型，见 ADR-0055；结果回模型归 #314）
- [#316](https://github.com/Abe-Junwei/Jieyu/issues/316) B17 外部证据源（命中映射已落地，flag 默认关；stdio 宿主桥，浏览器不 spawn；命中回模型归 #314）

排序（2026-10-13 21:23，2026-10-15 补 A15、B16、B17）：先词典页闭环，再语料库页闭环（#298、#299 归入语料库页），B16 与 B7 同属这一段，B17 在 B16b 之后。A 系列 #286–#297 按需。A15 的 R1/R2 代码在 main、flag 关，不挡 [#250](https://github.com/Abe-Junwei/Jieyu/issues/250) 的交付，不进试用版默认路径。B16/B17 的领域查询与核对已落地，flag 默认关；智能体顺序见主路线图 §2.2.0。

## Not yet specified

- 语言学者试用告一段落之后的去向：数据保留、转正式版与收费（2026-10-13 用户：以后再定）。
（2026-10-14 移除已定项：换电脑靠导出 JYM、性能只记录不设门槛（21:18 第 7 条）；冻结后迁移验证（21:14 第 6 条、#281）；隐私承诺（A9 默认开、首次云端转写伦理对话框，20:16 第 1 条、21:18 第 6 条，中文隐私说明见 #307）。）

## Out of scope

- 本地启动器 + 浏览器打开的路线（原 A/B）：用户改走桌面外壳。
- 远程托管网站、域名、国内访问与备案：用户明确不设服务器。
- 实时同步 / Supabase 云协作：只靠项目包互传（主路线图 C4 另行推进，不在这一程）。
- 附带或推荐通用大模型（WebLLM、Ollama）：AI 对话与分析用自填云端密钥。本机语音转写（whisper-server）不在此列。
- Intel Mac 与 Windows ARM 安装包（2026-10-14：首发只出 Apple 芯片 Mac 与 Windows x64）。
- 移动端。
- 试用名单与节奏：用户本人安排。
- Tauri：已选 Electron。
- 插件与扩展生态（2026-10-14）：不做到扩展中心，不开放第三方插件。已在仓库里的扩展运行时不因此删除。
