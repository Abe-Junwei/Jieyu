---
title: desktop-engineering-contract requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-engineering-contract-spec
---

# Requirements — 首发工程规格定稿

## 1. What & Why

- 将用户确认的 [ADR-0100](../../../adr/0100-desktop-engineering-contract.md) 变为可实现、可验证的接口与验收依据，解除“仅有静态设计板”的缺口。
- 本轮只整理规格；`draft` 表示技术设计尚未定稿，不撤回 ADR 已接受的产品决定。
- 不实施应用代码、DDL、依赖安装、用户文件迁移或 Penpot 修改；不把规格已写等同产品已实现。

## 2. 用户场景

1. 研究者连续编辑、撤销、复核和离开项目，知道哪份内容已保存、已生效，故障时不误覆盖。
2. 研究者维护完整词典及项目字段，执行显式关系查询，能取消、定位并识别过期／不完整结果。
3. 研究者导入标注、迁移媒体、生成成果和备份，知道结构损失并能恢复完整项目。

## 3. 规格验收

- [x] 逐项工程决策已访谈并由用户最终确认，持久记录在 ADR-0100。
- [x] 当前实现与目标区分，入口／持久化／读回／故障的验收矩阵见 design §3。
- [x] 全部既有宿主／模型字段表及新增类型、状态与接口编码提案见专项稿，图真值不变；实施/格式冻结仍待验证。
- [x] JQ1文法、类型／算子、可视化转换及复杂度／正则候选已形成具体稿，包装器和预算实测后锁定。
- [x] 跨窗口单写者／查询锁／回执查询／退出时序与故障规格已整理。
- [x] 五种成果格式逐字段损失及外部工具往返矩阵已整理（未实际外部应用验证）。
- [x] 合成容量／性能测试协议及计量规则已整理，未填虚构实测数据。
- [x] 域切片、落位与测试命令已给出，具体代码Plan及用户实施确认仍为后续准入，不授权本轮实现。

## 4. 受影响代码地图（只读锚点，不是本轮改动）

| 域 | 既有入口／持久化 |
| --- | --- |
| 保存／生命周期 | `electron/main.ts`、`src/db/desktop/desktopCall.ts`、`openProject.ts`、`units.ts` |
| 分析／词典 | `src/db/desktop/` 领域操作、`src/pages/DesktopAnnotationPage.tsx`、`DesktopLexiconPage.tsx` |
| 现有查询 | `src/pages/DesktopCorpusQueryPanel.tsx` → `src/db/desktop/corpusQuery.ts` |
| 交换 | `src/pages/DesktopExchangePanel.tsx` → `src/db/desktop/foreignImport.ts`／`projectExchange.ts` |
| 成果复用 | `src/services/eaf/`、`TextGridService.ts`、`src/utils/transcriptionIgtLatexExport.ts`、`dmlexJsonExport.ts`、`lexiconLiftExport.ts` |
| schema／文案 | `src/db/desktop/schema.ts` 唯一 DDL；`src/i18n/dictKeys.ts` 与字典承接 UI 文案 |

## 5. 依赖与终止

- 既有领域落点、分析图重建及专业查询 SDD 继续分域承接；本目录只负责跨域合同定稿，不平行再写一份查询语言真源。
- 数据格式仍按 ADR-0086 冻结规则；实施前明确受控合成项目重建及版本，绝不默补用户文件列。
- 全部任务完成删除本目录，持久决定留 ADR-0100，未过产品门继续留发布清单。
