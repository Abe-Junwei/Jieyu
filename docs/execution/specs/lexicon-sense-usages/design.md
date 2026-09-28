---
title: lexicon-sense-usages design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-usages-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Usages

## 1. 成熟方案扫描 / Research

- 仓库既有：义项语义域已经是 `senses[].semanticDomains`，草稿按行拆分、去空白、去重、保序。导入用 `senses: parsed.senses` 整段替换。保存时从 `...rest` 拆掉旧键。trait 读取只看直接子节点的 `name`。
- 同类产品：FLEx 把 Usages 写成义项上任意条 `<trait name="usage-type" value="..."/>`，值必须来自 FLEx 的用法列表（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)，Sense elements → Usages）。它排在 Source 之后。Jieyu 不内置那份封闭列表。
- 业内：SIL LIFT 0.13 的 `<trait>` 挂在父元素上，`name` 区分种类。同一义项可以有多条同名 trait。
- 公认不可行：把用法写进来源注释或语义域；读取词条上的同名 trait；把 `morph-type` 或其他 trait 名当成用法；为这一组字符串新开 Dexie 版本；在本切片做用法浏览。
- 潜在的坑：保存时若不从 `...rest` 拆掉旧数组，清空后用法还在。空 value 和重复值要丢掉。导入省略这些 trait 时义项数组会被整段替换。
- 决定：**复用** 语义域的行解析和 trait 列表读取。`usages` 是该义项的 `usage-type` 值。空白省略键。出站排在来源注释之后、子义项之前。忽略词条级 `usage-type`。无新 flag，无新 Dexie 版本，无新 controller，无封闭词表。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + 义项列表的一个字符串数组
- 拒绝：新 controller；封闭词表；词条级 trait；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略义项 `usages` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | 义项 `name="usage-type"` |
| `LexiconEntryEditForm.tsx` / `LexiconSenseList.tsx` | 多行输入与义项列表 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空 value 和重复值被丢掉，顺序保留。
- 再次导入省略这些 trait 时，用法随 `senses` 整段替换而消失，来源注释仍按同一规则重读。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
