---
title: 桌面首发产品设计验收清单
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-11-17
source_of_truth: release-gate
---

# 桌面首发产品设计验收清单

> 工程范围现已由用户确认：[ADR-0100](../../adr/0100-desktop-engineering-contract.md) 是保存、草稿、分析、字段、查询、文件和容量／性能的新合同；[技术规格](../specs/desktop-engineering-contract/requirements.md) 尚待定稿。UI 以 [DESIGN.md](../../../DESIGN.md) 为准；页面精稿在 Pixso 文件 `va44BZLBUSYRQ7KoiO3PJw`（[ADR-0118](../../adr/0118-pixso-is-the-design-draft-workspace.md)）。Open Design 停用。视觉方向仍按 [ADR-0101](../../adr/0101-desktop-visual-direction-reexplore-superdesign.md)。

本清单落实 [ADR-0099](../../adr/0099-desktop-product-design-and-release-contract.md) 的 R01–R12。勾选需附当次 Electron 入口、操作、预期／实得、重启读回与故障证据；设计板存在不等于通过。仅用可重建合成项目，不读取真实研究材料。

## 词典字段分组依据

- `dmlexEntrySchema`：headword、homographNumber、partsOfSpeech、labels；pronunciations 的 soundFile／transcriptions(text, scheme)／labels；inflectedForms(text, tag, labels)。
- senses：indicator、labels、definitions(text, definitionType)、examples(text, sourceIdentity, sourceElaboration, soundFile, labels, exampleTranslations(text, langCode, labels))；headwordExplanations(text, langCode)、headwordTranslations(text, langCode, partsOfSpeech, labels)。
- etymologies：description、etymons(etymonUnits(langCode, text), when, type, note)。重复项按分组编辑，不要求塞进同一屏。
- 项目扩展：`jieyuLexemeSchema` 的 notes、anchoredNotes 的正文／分类、例句／出现引用；`LexemeSave` 的 tags、accessRights、词条与义项自定义字段，附件走专用操作。身份引用经专用选择／迁移，ID、来源凭据与时间戳不作为任意文本编辑。
- 用户可见设计稿文字接代码时必须落 `dictKeys`／字典；不把画板文字直接硬编码到 UI，也不把设计说明、测试状态放进产品日常操作界面。

## 工程规格与验收状态

**产品与工程行为决定已接受，技术规格未全部定稿，产品发布门未通过。** ADR-0100 E00–E14 记录全部确认；[工程规格索引](../specs/desktop-engineering-contract/design.md)已补保存恢复、分析时间、字段词典、JQ1与执行、格式及验收专项技术稿；V01–V19 指定真实入口→数据写入→重开读回→故障路径。不得用画板数量、导航链接或旧单元测试替代。

- [ ] E01–E04：保存回执、持久草稿、离开守卫、跨对象撤销、局部复核和保护依赖历史清理，按 V01–V04 验证。
- [ ] E05/E07：全模型词典和全部已接受宿主的类型化自定义字段，定义与值整体迁移、必填依赖阻清除，按 V05/V07 验证。
- [ ] E06/E08：毫秒时间、点层、拆合／层迁移及单写者只读窗口，按 V06/V08 验证。
- [ ] E09–E10：专业语法和构建器、跨窗全项目锁、5秒取消升级、30秒／5分钟及1,000／10,000结果限制、过期定位，按 V09–V11 验证。
- [ ] E11：AI版本凭据与云授权、逐稿导入、不同录音迁移和暂定时间，按 V12–V14 验证。
- [ ] E12：一致快照、临时文件发布、草稿抢救、含媒体副本恢复与四用途格式证据，按 V15–V17 验证。
- [ ] E13–E14：故障抢救、诊断脱敏、核心键盘及容量性能基线，按 V18–V19 验证；目标数值不是已测数据。

### 首发性能证据门（未测）

- [ ] 8GB／四核／SSD，在100小时／50GB、10万句段、100万词、5万词条且含历史／字段的合成项目完成核心流程。
- [ ] P95：交互≤100ms、普通保存持久化≤1s、切稿≤1s、冷开≤5s；重任务无超过200ms的界面冻结。
- [ ] 固定答案查询集冷／热分别测：精确／标签≤2s，同句／跨层≤5s，有界跨段≤10s，不靠截断或超时过关。
- [ ] 全应用进程内存稳定≤1.5GB、重任务峰值≤3GB；本地AI单列，不依赖交换空间勉强过关。

## 设计交接门

- [ ] R01：每条要求映射到设计稿（Pixso）、Electron 可达入口、待补实现与测试；不能用旧浏览器截图或函数存在替代端到端证据。
- [ ] R02：跨工作区往返保留项目／稿件／层／片段，保存中／失败／重试／放弃和关闭拦截有样例。
- [ ] R03：正文变化、待复核、逐项对应修复、校验失败与重新生效有样例；有效分析和历史内容区分。
- [ ] R04：真实结构的 IGT 合成样例覆盖长词、空 gloss、多语素、多语言与跨轨重叠，而非只有输入色块。
- [ ] R05：现有词典数据模型可编辑字段逐项盘点；多义项、嵌套字段、引用影响及解除／迁移后提交有样例。
- [ ] R06：专业查询条件、文本／构建器切换、不支持表达只读、错误定位、跨片段结果有样例；语法须经专项设计。
- [ ] R07：保存等待、执行锁写、取消中、解除锁、过期结果和目标失效均可观察。
- [ ] R08：未配置／未启用／离线、建议编辑、冲突、原子批量采纳、重启后继续审核有样例。
- [ ] R09：稿件／录音软删、依赖恢复、保留期限、提醒、清理未知与旧备份范围有样例。
- [ ] R10：项目异常、导入映射与冲突、导出范围／损失报告、恢复副本有样例。
- [ ] R11：窄／矮窗口、字体放大、键盘焦点、明暗与减少动态有实际验证记录。
- [ ] R12：导入已有录音可进入完整流程；段落录音按实际交付范围标识。

## 产品发布门

- [ ] 断网且无 API Key，从录音导入到手动转写、IGT、完整专业词典、专业检索、本地成果导出闭环通过。
- [ ] 自动保存失败不丢草稿；关闭／切项目、破坏性操作和后台任务交错可重现验证。
- [ ] 正文变化后旧分析不泄漏进有效检索／统计／AI／普通导出；备份保留历史，恢复重校验。
- [ ] 词典全部现有可编辑字段及项目自定义字段写入→关闭重开→读回；嵌套字段和未修改字段不丢失；被引用义项删除／合并完整迁移或解除。
- [ ] 专业查询词序、相邻、跨层、有界跨片段组合正确；错误定位、取消、锁释放与过期定位通过。不能用现有字段筛选冒充专业查询。
- [ ] AI 已生成建议重启保留且未擅自成为正式数据；原子批量采纳中途失败全回滚；旧版本、已删除对象和迟到结果无法写入。
- [ ] 删除／恢复／提醒／文件收尾遵守 ADR-0087，数据库与文件结果失败／未知路径验证。
- [ ] 支持格式逐项提供 Electron 操作入口与合成材料导出／重新导入读回证据；无法表达内容经事前确认并附报告。
- [ ] 核心流程键盘与焦点、明暗、字号、减少动态逐项有证据；未通过项不以有开关结案。
- [ ] ADR-0099/0100全部新增阻断能力通过；ADR-0098 后移的模型交付余项没有被误加回。

## 2026-11-01 格式与接线核查起点（不是支持承诺）

- Electron 成果／交换入口：`src/pages/DesktopExchangePanel.tsx` → `src/db/desktop/desktopCall.ts` → `src/db/desktop/projectExchange.ts`，目前有项目 JYT、含媒体 JYM、单稿 JYT。项目全量包与普通单稿的范围不同，不能混用。
- Electron 外部导入：`src/db/desktop/foreignImport.ts` 识别 EAF、FLExText、TextGrid、Toolbox、LIFT、JYB；仅说明存在解析路径，不保证任意文件都无损，也不将 JYB 解析路径解释为恢复已取消的旧库迁入首发门槛。
- 既有 EAF、FLEx／TextGrid 和轻量成果序列化、IGT LaTeX、LIFT、DMLex 需要逐项核对 Electron 接线。`src/services/eaf/eafExport.ts`、`src/utils/transcriptionLiteExport.ts`、`src/utils/transcriptionIgtLatexExport.ts`、`src/utils/lexiconLiftExport.ts`、`src/utils/dmlexJsonExport.ts` 可作复用候选，函数存在不代表桌面支持。
- 本轮复跑 `exchange.test.ts`、`corpusQuery.test.ts`、`lexemeLink.test.ts`、`manuscriptDeletion.test.ts`，4 文件 33 项通过；页面侧 `DesktopAnnotationPage.test.tsx`、`DesktopLexiconPage.test.tsx`、`DesktopDeletionReminderDialog.test.tsx`，3 文件 15 项通过。它们证明现有子链，不证明本清单新要求已满足，也不是格式完整往返／Electron UI 通过证据。

## 2026-11-17 1a 正文保存故障证据

范围仅正文生产链；以下通过不勾选跨对象撤销、只读多窗或全部 E01–E04，也不代表首发发布门通过。仅用临时合成项目，未读取真实研究材料。

`npm run test:e2e:desktop-project`：macOS 开发态 Electron 13 passed／3 skipped。跳过项是本地 Whisper 真模型和两个安装包专用场景，未新增 skip。`tests/e2e-desktop/project-flow.spec.ts` 新增以下真实入口故障场景：

- 事务前失败／留下：正文输入仍在，窗口仍开，SQLite 正文未变；解除故障再关窗，重开读回新正文。
- 事务前失败／重试：第一次写入失败，重试成功后关闭，重开读回新正文。
- 事务前失败／放弃：等待草稿删除确认再关闭，重开仍为旧正文，已放弃输入不复活。
- 正文已提交／回执丢失：查询同一 operationId 的 committed 回执，不重复写，manuscript generation 仅增加一次；关闭重开读回新正文。
- 正文已提交／回执与核实均失败：继续输入 B 后关窗仍被拦住，库中只有 A；核实恢复后只提交 B，generation 总计增加两次，重开读回 B。guard 定向测试另验证未知期间拒绝放弃、确认未提交后才写最新版本。

`npm run test:e2e:chromium`：121 passed／2 flaky／1 skipped，退出码 0。两项首轮超时后重试通过：AI runtime v2 real entry 的 workspace 挂载、R4 S6 offline cold-open 的创建层对话框关闭；本轮没有改这些浏览器路径，也不把重试通过解释成波动已修复。

定向 Vitest：6 文件 78 passed；`typecheck`、完整架构守卫、agent-evals smoke（4/4）、文档治理、工作流守卫、触及源码的 ESLint 与 `git diff --check` 均通过。

本片未覆盖 Windows、安装包、进程强杀／系统断电或真实材料自用。SQLite 同事务、旧格式拒绝且字节不变、草稿重开及 hook 并发分支另由定向 Vitest 验证。

## 收口规则

本清单在本首发验收仍有效时维护。全部门槛实际通过后，证据归发布记录并删除此活动清单；持久产品决定保留于 ADR-0099/0100，不在此复制第二份权威要求。
