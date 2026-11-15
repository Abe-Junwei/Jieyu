---
title: desktop-lexicon-complete-editor design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-lexicon-complete-editor-spec
depends_on:
  - ./requirements.md
---

# Design — desktop-lexicon-complete-editor（Research 门）

## 1. 成熟方案扫描 / Research

- 仓库既有：`LexiconEntryEditForm`、桌面 `DesktopLexiconPage`、M5-B JSON 义项行、附件 ADR-0095、Penpot 35／47／48 字段分组。
- 同类产品：FLEx／WeSay／Lexique Pro — 义项树 + 引用 + 媒体；SIL LIFT／DMLex 为交换事实标准。
- Best practice：嵌套编辑按分组，不单屏塞满；被引用删除必须迁移／解除（ADR-0099 相对 ADR-0090 收紧入口）。
- 反模式：浏览器截图冒充 Electron 验收；为 UI 方便直接加冻结列；把设计稿字硬编码进产品。
- 坑：嵌套 id 补齐与校验已在桌面写路径；旧页与桌面页双轨期间禁止双写；附件外部收尾不确定态。
- **决定：适配** — 复用义项表单与桌面附件，换统一事件／Query；格式变更另 ADR。切片 3 开工前把本 § 对照代码再扫一轮。

## 2. 架构选择

- 待切片 3：页面装配 + lexicon desktopCall；不新持久化引擎。

## 3. 落位（开工时填行数）

| 文件 | 职责 |
| --- | --- |
| 词典工作区页 | 完整编辑壳 |
| 统一失效表 | 词条／义项保存事件 |

## 4. ADR

- ADR-0099 R05；ADR-0090／0095；改表须新 ADR。
