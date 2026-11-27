---
title: ADR 0144 - 人工确信按正文层保存
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-25
source_of_truth: decision-record
depends_on:
  - ./0086-desktop-release-scope-and-format-freeze.md
  - ./0132-layer-scoped-transcription-and-legacy-create-routing.md
  - ./0140-unit-text-audios.md
---

# ADR 0144：人工确信按正文层保存

## 背景

转写与翻译可以各自判断。格式 35 把 `self_certainty` 放在共享 `units` 上，同一句段只能有一个值。空卡也要能先标确信或写层备注。承接 1b-6 已确认的产品语义。

## 决定

1. **一个正文记录一个判断。** `unit_texts` 增加可空 `self_certainty`，值仅为 `not_understood`、`uncertain`、`certain` 或 NULL。正文身份仍是 `(unit_id, layer_id, role)`；`role` 由 `resolveUnitTextContext` 从目标层 `content_type` 派生，写调用方不自选 role。
2. **去掉共享真值。** 删除 `units.self_certainty`。读写、拆合与快照只看正文行；不回退共享值，不双写，不把人工确信写进机器 `confidence`。
3. **空正文载体按需存在。** `body=''` 合法。首次在空卡添加层备注或设置非空确信时，同一事务创建对应正文行。清空正文时清除该行确信，但保留备注、录音及稳定正文 id。只要仍有层备注、录音或非空确信，不得删除载体行。
4. **生命周期按层执行。** 正文实际改变清除本层确信；正文未改变不清除；撤销恢复正文和原判断。拆分只有非空正文侧继承；合并在每个层的来源间计算，任一来源缺行或未标记则结果 NULL，否则取最不确定档。
5. **开发格式升到 `user_version` 36。** 不迁移。新程序拒绝旧 `project.sqlite` 且不改字节；manifest 与载荷的 `userVersion` 均须匹配。旧数据留给对应旧程序查看。
6. **整条消费者链同批切换。** schema、冻结记录与全部依赖消费者在同一可构建 PR 交付；关闭新 UI flag 也不能回读旧列。

## 未选方案

- 保留 `units` 值作兜底：层内空值与共享值竞争。
- 每个空卡都预建正文：没有内容也制造身份。
- 单独确信表：已有正文稳定身份足够。
- 给 35 库补列并迁移：与开发格式冻结冲突。

## 影响

- 冻结记录换成 36 的 DDL 签名。
- 1b-6 的 6c 领域实现以本篇为准；元数据 UI 仍待精稿，不由本篇授权接线。
