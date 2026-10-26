---
title: remaining-milestones-contracts requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-10-26
source_of_truth: remaining-milestones-contracts-spec
depends_on:
  - ../../../adr/0091-field-revisions-diagnostic-delivery-and-later-milestones.md
  - ../desktop-domain-write-boundaries/requirements.md
  - ../desktop-project-deletion/requirements.md
---

# Requirements — 后续里程碑的已核对合同

## 1. 目标与状态

把 2026-10-26 已确认的操作规则落成仓库决定，并核对字段、诊断库和文件原语。来源单域和备注载体已落地。旧备注入口未接。未实施的切片不能勾成完成。

已确认规则在 [ADR-0091](../../../adr/0091-field-revisions-diagnostic-delivery-and-later-milestones.md)。字段、构造点和平台结论在 [design](./design.md)。

## 2. 本轮必须成立的事实

- 九类旧备注目标都有去向。有生产构造点的类写明入口。没有生产构造点的类保留导入和恢复能力，不因没有按钮而丢字段。
- 词条和义项备注只进 `jieyu_json`。当前 `JieyuNote` 只有 `owner`、`ref`、`text`，装不下旧备注的多语正文、分类、来源和稳定 id。
- 本机诊断复用 userData 里已有的 SQLite 文件和连接方式。不复用 `audit_logs` 的按 id 覆盖写入。
- 系统垃圾箱使用 Electron `shell.trashItem`。它没有可回滚句柄。Linux 上调用失败是失败，不是已清除。本轮没有跑三个平台。

## 3. 验收（未来实现，当前不预填通过）

- [ ] 来源单域：两个入口改不同字段都保留；同一字段和改回原值的冲突保留草稿；诊断库拒绝或崩溃后内容仍在，重试只补日志且不重复。
- [x] 备注：九类合成输入关闭重开；时间轴和波形不串；两个词条的同名义项不串；分析恢复不覆盖后来的备注正文。旧页面未接。
- [ ] 转写：映射变化后旧预览不能接受；响应丢失能查到原接受事实；同一候选不重复写入。
- [ ] 删除与文件：closing 期间新写入被拒绝；垃圾箱调用开始后不报告恢复成功；备份复制期间清单内文件不被移走。
