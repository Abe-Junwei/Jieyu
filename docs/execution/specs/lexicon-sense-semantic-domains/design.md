---
title: lexicon-sense-semantic-domains design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-semantic-domains-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Semantic Domains

## 1. 成熟方案扫描 / Research

- 仓库既有：义项语法注释已经是 `senses[].grammarNote`。导入用 `senses: parsed.senses` 整段替换。保存时从主义项和额外义项的 `...rest` 拆掉旧键，空白才真正删掉。路线图数据模型曾把 `semanticDomains: string[]?` 写在词条上，浏览仍是 P2。
- 同类产品：FLEx 把语义域写成义项上的 `<trait name="semantic-domain-ddp4" value="…"/>`。`value` 是缩写加名称，一个义项可以有任意条（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)，Sense → Semantic Domains）。例子是 `<trait name="semantic-domain-ddp4" value="1.1.1 Matahari"/>`。FLEx 要求这些值和项目 Lists 里的语义域一致；解语没有这份词表。
- 业内：Dictionary App Builder 默认不显示 LIFT `trait`。要在 App 里看见语义域，需要另外的脚本把 trait 展开（[SIL community](https://community.software.sil.org/t/two-writing-systems-as-separate-lexicons/2265)）。interlineaR 也把 `semantic-domain-ddp4` 标成义项 trait，值在 `@value`。这一刀只编辑和交换，不做浏览。
- 公认不可行：把语义域写进词条、语法注释或封闭枚举；读取词条上的同名 trait；为这一组字符串新开 Dexie 版本或新 controller；顺手做语义域浏览。
- 潜在的坑：保存时若不从 `...rest` 拆掉旧数组，清空后还在。导入省略这些 trait 时不能承诺保留已有语义域，因为义项数组会被整段替换。空值、重复值要丢掉，顺序要留。`value` 里的 `&` 出站必须转义。
- 决定：**复用** 义项 JSON。编辑草稿是多行字符串，存成 `semanticDomains?: string[]`。空白省略键。出站在该义项内、语法注释之后、子义项之前写若干 trait。忽略词条级同名 trait 和其他 trait 名。无新 flag，无新 Dexie 版本，无新 controller，无封闭词表。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + 义项列表的一个数组字段
- 拒绝：新 controller；词条级语义域；封闭词表；语义域浏览；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略义项 `semanticDomains` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | 义项 `semantic-domain-ddp4` |
| `LexiconEntryEditForm.tsx` / `LexiconPage.tsx` | 输入与义项列表 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空 trait 值和重复值不入库。
- 再次导入省略这些 trait 时，语义域随 `senses` 整段替换而消失，语法注释仍按同一规则重读。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
