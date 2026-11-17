---
title: desktop-field-editor requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-field-editor-spec
---

# Requirements — 完整词典与项目字段编辑

## 范围与状态

落实[ADR-0100](../../../adr/0100-desktop-engineering-contract.md)的V05/V07对应目标。[design](./design.md)给出本轮技术审阅提案；用户行为决定已接受，技术编码尚未实施，不改产品代码或用户材料。

## 验收

- [x] 行为、边界、失败分支与验证方法已整理为具体技术提案。
- [ ] 技术审阅及必要实测完成，锁定接口/载荷与资源参数。
- [ ] 分成半天内的代码任务，逐片确认落位与测试Plan后才能实施。
- [ ] 真实入口写入→重开读回及故障测试通过，不以文档代替。

## 代码锚点

dmlexEntrySchema.ts、customFieldValidation.ts、customFields.ts、customFieldMigration.ts。完整依赖与测试命令见[总验收协议](../desktop-engineering-verification/design.md)。

## 生命周期

相关任务全部交付后删除本目录，持久决定仍留ADR-0100，发布证据留活动验收门。
