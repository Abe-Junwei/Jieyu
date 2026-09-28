---
title: DMLex 1.0 JSON Schema 副本
doc_type: architecture-spec
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: dmlex-json-schema
---

# DMLex 1.0 JSON Schema 副本

OASIS Standard，2025-04-29。从官方目录原样复制，供词典编辑基准对照，不改字段。

- 目录：<https://docs.oasis-open.org/lexidma/dmlex/v1.0/os/schemas/JSON/>
- 正文：<https://docs.oasis-open.org/lexidma/dmlex/v1.0/os/dmlex-v1.0-os.html>
- 编辑基准用带跨语言模块的 `dmlex.schema.json`（`$id` 为 `http://docs.oasis-open.org/lexidma/ns/dmlex-1.0`）。`dmlex_no-crosslingual.schema.json` 只作对照，不作为编辑基准。

| 文件 | SHA-256 |
| --- | --- |
| `dmlex.schema.json` | `700af3115b99fcf5910cbfeb231acb290d33a4931ea55c3356cd781cca0af86e` |
| `dmlex_no-crosslingual.schema.json` | `53b96e3652b6080338565a8a4c2ada1297e8648779cadc59c876c88310926e03` |

JSON 序列化里 `partOfSpeech`、`label`、`translationLanguage` 是字符串。`entry`、`sense`、`example` 等对象 `additionalProperties` 为 false。解语自己的语段引用和自由文本注释不能写进这些对象。

决策见 [ADR 0035](../../adr/0035-lexicon-edit-baseline-dmlex.md)。实施顺序见 [词典编辑改用 DMLex 基准](../../execution/plans/词典编辑改用DMLex基准-2026-09-27.md)。
