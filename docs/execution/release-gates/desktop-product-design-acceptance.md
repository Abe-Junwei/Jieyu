---
title: 桌面首发产品设计验收清单
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-11-01
source_of_truth: release-gate
---

# 桌面首发产品设计验收清单

> 当前任务已由用户限定为“先做好 UI 规范，工程规范后定”。当前 UI 规范以 [DESIGN.md](../../../DESIGN.md) 与 Penpot「解语 · UI 规范」00–17 为准。本文保留此前需求讨论与后续工程／发布核查记录，不作为本轮 UI 规范的完成条件；下文旧画板编号和范围记录属于参考暂存材料。

本清单落实 [ADR-0099](../../adr/0099-desktop-product-design-and-release-contract.md) 的 R01–R12。勾选需附当次 Electron 入口、操作、预期／实得、重启读回与故障证据；设计板存在不等于通过。仅用可重建合成项目，不读取真实研究材料。

Penpot：[19–26 业务合同起点](https://design.penpot.app/?screen=workspace&file-id=08b470c5-dda4-812a-8008-dfdf04bd318d&page-id=119beb0f-bbfd-8072-8008-e07b325993e1&board-id=906d502e-2566-807f-8008-e0be30b38da4)。2026-11-01 已写入并读回 8 板、每板 15 个文本节点，抽查 19／20／22／26 导出排版；它们是业务合同示意，按页精稿和完整业务样例仍需交接验收，下面不据此勾选通过。

## 2026-11-01 按审查顺序修补的界面证据

以下是设计样例完成记录，不是下面的 Electron 产品发布验收。27–50 共 24 板，均为原生可编辑形状和文本；19–26 已增加对应界面样例入口。主要按钮与主轨连接为检查原型，表单值、保存、查询和文件操作不在 Penpot 中执行。

1. **统一工作台与往返**：[27–29](https://design.penpot.app/?screen=workspace&file-id=08b470c5-dda4-812a-8008-dfdf04bd318d&page-id=119beb0f-bbfd-8072-8008-e07b325993e1&board-id=906d502e-2566-807f-8008-e0bf4090b568) 展示项目／稿件／层／片段一致上下文、检索命中回片段、保存失败保留草稿及重试／放弃／留下。28 补全条件 A、关系和 B，显示跨片段命中的两段上下文；46 补文本保留与取消中。
2. **删除恢复**：[30–32](https://design.penpot.app/?screen=workspace&file-id=08b470c5-dda4-812a-8008-dfdf04bd318d&page-id=119beb0f-bbfd-8072-8008-e07b325993e1&board-id=906d502e-2566-807f-8008-e0bf70ab95a5) 分开软删除影响、保存／停任务前置、恢复依赖和不恢复的兄弟稿件、提醒等待与文件结果未知。
3. **IGT 与词典**：[33–35](https://design.penpot.app/?screen=workspace&file-id=08b470c5-dda4-812a-8008-dfdf04bd318d&page-id=119beb0f-bbfd-8072-8008-e07b325993e1&board-id=906d502e-2566-807f-8008-e0bfd70d39cb) 用词列／语素列绘制合成 IGT、空 gloss、长词、义项候选和复核错误；47–48 补字段分组及引用迁移／解除。
4. **项目与交换**：[36–39](https://design.penpot.app/?screen=workspace&file-id=08b470c5-dda4-812a-8008-dfdf04bd318d&page-id=119beb0f-bbfd-8072-8008-e07b325993e1&board-id=906d502e-2566-807f-8008-e0bffdd673c2) 展示媒体缺失／备份失败降级、导入角色歧义阻断、导出具体损失及恢复副本；49 是导出完成报告，50 是占用／格式不兼容的互斥错误样例。
5. **工程范围对照**：[40](https://design.penpot.app/?screen=workspace&file-id=08b470c5-dda4-812a-8008-dfdf04bd318d&page-id=119beb0f-bbfd-8072-8008-e07b325993e1&board-id=906d502e-2566-807f-8008-e0c03d2d0643) 按 R01–R12 列出样例覆盖与待补工程条款；Electron 入口与数据链证据仍以本清单的代码核查记录为准，不以浏览器实现代替验收。
6. **AI 审核**：[41–42](https://design.penpot.app/?screen=workspace&file-id=08b470c5-dda4-812a-8008-dfdf04bd318d&page-id=119beb0f-bbfd-8072-8008-e07b325993e1&board-id=906d502e-2566-807f-8008-e0c040c9d018) 展示重启中断保留、编辑候选、批量采纳及冲突全不写入；没有将后移的模型交付入口画为已可用。
7. **窗口与复合状态**：[43–45](https://design.penpot.app/?screen=workspace&file-id=08b470c5-dda4-812a-8008-dfdf04bd318d&page-id=119beb0f-bbfd-8072-8008-e07b325993e1&board-id=906d502e-2566-807f-8008-e0c083ade536) 分别展示 1280px、1024×600／字体角色放大及暗色，标明折叠入口与焦点返回目标。控件边界用 border-control，焦点描边 2px；暗色主轨使用常亮文字，避免误用反相 CTA 字色。

### 字段分组依据（35／47／48）

- `dmlexEntrySchema`：headword、homographNumber、partsOfSpeech、labels；pronunciations 的 soundFile／transcriptions(text, scheme)／labels；inflectedForms(text, tag, labels)。
- senses：indicator、labels、definitions(text, definitionType)、examples(text, sourceIdentity, sourceElaboration, soundFile, labels, exampleTranslations(text, langCode, labels))；headwordExplanations(text, langCode)、headwordTranslations(text, langCode, partsOfSpeech, labels)。
- etymologies：description、etymons(etymonUnits(langCode, text), when, type, note)。重复项按分组编辑，不要求塞进同一屏。
- 项目扩展：`jieyuLexemeSchema` 的 notes、anchoredNotes 的正文／分类、例句／出现引用；`LexemeSave` 的 tags、accessRights、词条与义项自定义字段，附件走专用操作。身份引用经专用选择／迁移，ID、来源凭据与时间戳不作为任意文本编辑。
- 用户可见设计稿文字接代码时必须落 `dictKeys`／字典；不把画板文字直接硬编码到 UI，也不把设计说明、测试状态放进产品日常操作界面。

### 本轮验证及剩余边界

- 24 板已读回，文本框均在对应板界内；PNG 导出检查排版。尺寸检查不代替运行时文字溢出、屏幕阅读器或键盘测试。
- 268 处导航交互已读回，缺失目标为 0；19–26 的 8 个业务合同入口和旧规范 7 个相关板已连接到界面样例。不是对保存、数据库、查询引擎或系统文件操作的模拟实现。
- 用 sRGB 相对亮度公式计算 12 组基线颜色对：亮色正文／panel 15.55、次级／panel 5.88、正文／选中底 10.91、CTA 19.16、焦点／panel 6.95、控件边界／panel 3.49；暗色对应 14.51、8.22、10.65、17.87、5.96、5.14。文字门槛 4.5，焦点与控件边界门槛 3；仅这些颜色对通过，不宣称完整 WCAG 符合性。
- 仍需在 Electron 验证自动保存故障、关闭拦截、IME、Tab／Esc／焦点返回、字号放大、减少动态、锁释放与所有数据读回。专业查询正式语法／算子和完整词典实现按专项 SDD 推进；产品发布门维持未通过。

## 工程范围覆盖结论（组织纠正）

**首发需求范围已记录，工程规范尚未闭合，产品验收未通过。** 前述界面样例修补不能解释成“七类工程缺口已经全部修完”。

Penpot 同一页已重新分区：左侧工程规范（00–18）、业务合同（19–26）、范围覆盖表（40）；右侧第一行仅放转写／标注／词典／语料／项目五个核心工作区，各自下方放相关错误、确认、恢复与适配状态。旧板 ID 和已有导航目标保留；不再将所有界面竖排为同级面板。

[40 工程范围覆盖表](https://design.penpot.app/?screen=workspace&file-id=08b470c5-dda4-812a-8008-dfdf04bd318d&page-id=119beb0f-bbfd-8072-8008-e07b325993e1&board-id=906d502e-2566-807f-8008-e0c03d2d0643) 逐条列出 R01–R12 的范围、样例与待补条款。尚未闭合的规范包括：

- R02–R04：自动保存触发／并发／退出协议、分析逐项对应修复、层内重叠与边界和溢出规则。
- R05：虽然已盘点字段组，重复与嵌套项的全量控件、校验、迁移和解除流程仍未形成完整工程规格。
- R06–R07：正式查询语法、算子、跨层／有界跨段语义、文本与构建器无损转换，锁粒度／取消／崩溃释放。
- R08：持久建议与版本校验合同、原子批量采纳的实施设计；不得绕过冻结格式规则。
- R10／R12：逐格式字段损失与往返、重复媒体／重定位细则及录音导入闭环证据。
- R09／R11：删除恢复既有 ADR 继续有效；静态样例和颜色对不能替代任务协调、文件结果未知、键盘／IME／焦点／字号／减少动态的运行验证。

因此下面的设计交接与产品发布门继续保持未勾选；后续必须逐项用具体条款与证据关闭，不能以增加画板或导航计数结案。

## 设计交接门

- [ ] R01：每条要求映射到 Penpot、Electron 可达入口、待补实现与测试；不能用旧浏览器截图或函数存在替代端到端证据。
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
- [ ] 词典全部现有可编辑字段写入→关闭重开→读回；嵌套字段和未修改字段不丢失；被引用义项删除／合并完整迁移或解除。
- [ ] 专业查询词序、相邻、跨层、有界跨片段组合正确；错误定位、取消、锁释放与过期定位通过。不能用现有字段筛选冒充专业查询。
- [ ] AI 已生成建议重启保留且未擅自成为正式数据；原子批量采纳中途失败全回滚；旧版本、已删除对象和迟到结果无法写入。
- [ ] 删除／恢复／提醒／文件收尾遵守 ADR-0087，数据库与文件结果失败／未知路径验证。
- [ ] 支持格式逐项提供 Electron 操作入口与合成材料导出／重新导入读回证据；无法表达内容经事前确认并附报告。
- [ ] 核心流程键盘与焦点、明暗、字号、减少动态逐项有证据；未通过项不以有开关结案。
- [ ] 首发两项新增阻断能力通过；ADR-0098 后移的模型交付余项没有被误加回。

## 2026-11-01 格式与接线核查起点（不是支持承诺）

- Electron 成果／交换入口：`src/pages/DesktopExchangePanel.tsx` → `src/db/desktop/desktopCall.ts` → `src/db/desktop/projectExchange.ts`，目前有项目 JYT、含媒体 JYM、单稿 JYT。项目全量包与普通单稿的范围不同，不能混用。
- Electron 外部导入：`src/db/desktop/foreignImport.ts` 识别 EAF、FLExText、TextGrid、Toolbox、LIFT、JYB；仅说明存在解析路径，不保证任意文件都无损，也不将 JYB 解析路径解释为恢复已取消的旧库迁入首发门槛。
- 既有 EAF、FLEx／TextGrid 和轻量成果序列化、IGT LaTeX、LIFT、DMLex 需要逐项核对 Electron 接线。`src/services/eaf/eafExport.ts`、`src/utils/transcriptionLiteExport.ts`、`src/utils/transcriptionIgtLatexExport.ts`、`src/utils/lexiconLiftExport.ts`、`src/utils/dmlexJsonExport.ts` 可作复用候选，函数存在不代表桌面支持。
- 本轮复跑 `exchange.test.ts`、`corpusQuery.test.ts`、`lexemeLink.test.ts`、`manuscriptDeletion.test.ts`，4 文件 33 项通过；页面侧 `DesktopAnnotationPage.test.tsx`、`DesktopLexiconPage.test.tsx`、`DesktopDeletionReminderDialog.test.tsx`，3 文件 15 项通过。它们证明现有子链，不证明本清单新要求已满足，也不是格式完整往返／Electron UI 通过证据。

## 收口规则

本清单在本首发验收仍有效时维护。全部门槛实际通过后，证据归发布记录并删除此活动清单；持久产品决定保留于 ADR-0099，不在此复制第二份权威要求。
