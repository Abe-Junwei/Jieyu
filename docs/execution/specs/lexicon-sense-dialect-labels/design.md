---
title: lexicon-sense-dialect-labels design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-dialect-labels-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Dialect Labels

## 1. 成熟方案扫描 / Research

- 仓库既有：义项学术领域已经是多行 trait 列表。义项状态是另一条单值 `status`。导入用 `senses: parsed.senses` 整段替换。保存时从 `...rest` 拆掉旧键。词条上还没有方言标签字段。
- 同类产品：FLEx 把 Dialect Labels (Sense) 写成义项上任意条 `<trait name="dialect-labels" value="dialect name"/>`（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)，Sense elements → Dialect Labels）。词条级方言标签用同一个 trait 名，挂在 entry 上。值来自 FLEx Dialect Labels 列表。Jieyu 不内置那份封闭列表。
- 业内：SIL LIFT 0.13 的 `<trait>` 挂在父元素上，`name` 区分种类。同一义项可以有多条同名 trait。
- 公认不可行：把义项方言标签写进词条；读取词条上的同名 trait；把 `status` 当成 `dialect-labels`；为这一组字符串新开 Dexie 版本。
- 潜在的坑：保存时若不从 `...rest` 拆掉旧数组，清空后标签还在。空 value 和重复值要丢掉。`dialect-labels` 必须按属性精确匹配。导入省略这些 trait 时义项数组会被整段替换。
- 决定：**复用** 语义域的行解析和 trait 列表读取。`dialectLabels` 是该义项的 `dialect-labels` 值。空白省略键。出站排在义项状态之后、子义项之前。忽略词条级 `dialect-labels`。无新 flag，无新 Dexie 版本，无新 controller，无封闭词表。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + 义项列表的一个字符串数组
- 拒绝：新 controller；封闭词表；并入词条；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略义项 `dialectLabels` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | 义项 `name="dialect-labels"` |
| `LexiconEntryEditForm.tsx` / `LexiconExtraSenseEditor.tsx` / `LexiconSenseList.tsx` | 多行输入与义项列表 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空 value 和重复值被丢掉，顺序保留。
- 再次导入省略这些 trait 时，方言标签随 `senses` 整段替换而消失，义项状态仍按同一规则重读。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
