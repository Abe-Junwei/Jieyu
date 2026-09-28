---
title: ADR 0037 - 文件交换共用一份丢失清单
doc_type: adr
status: active
owner: transcription
last_reviewed: 2026-09-28
source_of_truth: decision
---

# ADR 0037 — 文件交换共用一份丢失清单

## 背景

标注导入各自返回自己的结果：EAF、TextGrid、TRS、FLEx flextext、Toolbox。丢失信息只在 EAF 的完成提示里拼了几句。词典导入是 LIFT 0.13 投影成 DMLex，对不上的字段有诊断码，界面只显示条数。

[Pepper](https://github.com/korpling/pepper) 用 Salt 做枢纽，导入、加工、导出各是一个模块。 [Corflow](https://github.com/DoReCo/corflow) 把口语多层标注收成文稿、类型中立的层和带时间的段。 [reBabel](https://github.com/mr-martian/rebabel-format) 用 SQLite 存单位和带命名空间的特征，写出前才套用户声明的重命名。 [LIFT](https://github.com/sillsdev/lift-standard) 写明交换格式不是词库的内部格式。四家都承认换格式会丢东西。Corflow 直接写了转换可能永远做不满意。

解语的枢纽已经定过。词条编辑基准是 DMLex（[ADR 0035](./0035-lexicon-edit-baseline-dmlex.md)）。EAF 是文本交换，整库原 id 在 `.jyt` / `.jym`（[ADR 0036](./0036-eaf-import-is-interchange.md)）。不需要第二套图或第二套 SQLite。

## 决策

1. 每种交换格式只对现有文稿或词条做一次投影。不引入 Salt、Corflow、reBabel 或 LIFT 的 .NET 库。不新增交换格式。
2. 导入结果带同一份丢失清单。一条记录是稳定代号加可选计数或名字。完成提示按代号取字典文案。EAF 已有的缺媒体、无法识别的时间单位、对不上的译文、无媒体跳过的独立层，改成这份清单里的代号，句子保持现在的意思。
3. 清单只报告没有写入枢纽的东西，或写入时做了猜测的东西。已经进 DMLex `entry` 或已经进层和语段的字段，不得再报成丢失。
4. 有两个及以上独立层、文件自己又没有角色表时，TextGrid、flextext、Toolbox 沿用 EAF 的角色确认。默认确认后仍是今天的行为：第一条当转写，其余当翻译。词和语素层不进这张表。TRS 没有这种层，不弹这个对话框。角色记在现有文稿元数据里。EAF 继续用已有的 `eafTierRoles`。另外三种用新的元数据键，不新增 Dexie 版本。
5. 往返键只在该格式真有稳定 id 时使用。EAF 标注 id 维持 ADR 0036。flextext 的 phrase guid 在当前文稿内对上则更新。LIFT 的 `entry@id` 继续按 id 覆盖。TextGrid、TRS、Toolbox 不编造标注 id；文稿里已经有语段时，清单写明这次是追加。
6. LIFT 继续只认 0.13。更高版本整文件拒绝。不在解析器里兼容 0.14 或 0.15。不读旁边的 `.lift-ranges`。不按 `dateModified` 做三方合并。
7. 不新增 feature flag，不新增 controller。角色确认继续走现有 `useImportExport` 的待处理状态。`useImportExport.importHandlers.ts` 只调用清单格式化，不把格式化正文写进该文件。

## 影响

- 纯函数放在 `src/utils/interchangeLossReport.ts`。各解析器在自己的结果上填清单。标注完成提示和词典导入错误都从这份清单取文案。
- 无角色表且未打开确认时，层的归类与现在相同。直接调用 `useImportExport` 的测试不传确认开关，行为不变。
- 生产路径沿用 `useTranscriptionImportExportInput` 里已有的确认开关，含义扩到全部标注格式。

切片、验证和非目标见 [文件交换丢失清单](../execution/plans/文件交换丢失清单-2026-09-28.md)。

## 不采纳

- 把 Pepper、Salt、Corflow、reBabel 收成依赖，或让用户维护 TOML / `.pepper` 工作流。
- 为换格式增加 EXMARaLDA、Pangloss、ANNIS、TEI、CoNLL-U。
- 把对不上的 LIFT 字段再存成第二套真值。ADR 0035 已经拒绝残留层。
- 声称格式之间可以无损互转。

## 回顾

若 TextGrid 或 Toolbox 后来有了稳定的标注 id 约定，另写 ADR 再把它收成往返键。本决策不改 ADR 0035 和 ADR 0036 的枢纽选择。
