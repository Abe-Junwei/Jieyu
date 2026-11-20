---
title: ADR 0129 - 编辑回执、撤销阻断与时间码草稿冲突
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-20
source_of_truth: decision-record
depends_on:
  - ./0086-desktop-release-scope-and-format-freeze.md
  - ./0100-desktop-engineering-contract.md
  - ./0116-page-notices-as-toasts-with-durable-carriers.md
  - ./0121-text-save-receipt-and-draft.md
  - ./0128-time-drafts-and-edge-undo.md
---

# ADR 0129：编辑回执、撤销阻断与时间码草稿冲突

## 背景

1b-2 落地后还差几处 ADR-0100 的要求。E01：边界、新建、删除、撤销、重做在回复丢失时，界面不知道这一步有没有生效，也不能放心重发。E04：ADR-0128 第 3 条说后来的编辑改过相关对象时不撤销更早那一步，但实现把这一步直接从栈里扔掉了，用户没有机会知道。E02：时间码草稿记了它基于的毫秒，正式时间后来被撤销或相邻段改动后，草稿还当成普通草稿显示。E03：改时间后有没有要标记复核的东西，没有写下来。

## 决定

1. **开发格式改为 `user_version` 31，新增 `edit_receipts`。** 列：`operation_id` 主键、`kind`、载荷的 sha256 `digest`、`manuscript_id`、`result_json`、`committed_at`。不设外键，语段删掉或撤销后回执还在。不写迁移器；不是 31 的库仍拒绝且不改字节（ADR-0086）。`text_save_receipts`（ADR-0121）不动。
2. **边界移动、共用边界、新建、删除、撤销、重做都带操作 id。** 回执和改动在同一个事务里写入。同一 id、同一载荷再来，直接返回存下的结果，不重做，也不再压一步撤销。同一 id、不同载荷报 `operation id conflict`。被拒绝的改动整体回滚，不留回执。另有 `units.inspectEdit`，按 id 和载荷答已提交、未提交或冲突。契约里操作 id 是可选的，旧调用照常运行，但没有回执。
3. **客户端在结果不明时先查。** 传输失败后按 id 查：已提交就采用存下的结果；未提交就用同一 id 重发一次；查不了或冲突就报「没能确认是否生效」，界面保持原状。领域拒绝也会回滚成「未提交」，所以会被重发一次，再拒绝一次，结果不变。
4. **撤销或重做遇到后来改过的对象时，这一步留在栈上。** 库不改，报可识别的 `edit-stale` 错误（消息以 `is stale` 结尾）。界面用提示条加常驻提示（ADR-0116）：「该语段之后又被改过，先处理后续修改」，并给出「放弃这一步撤销」按钮。按下才调用 `units.dropUndo`／`units.dropRedo` 扔掉当前稿件栈顶一步。不自动跳过。这一条细化 ADR-0128 第 3 条。
5. **读时间码草稿时比对基准。** 草稿的 `base_ms` 与这条边现在的正式值不同就标冲突，不改表。界面在时间框旁并排显示「现正式时间」和「你的输入」，给两个动作：「按新时间重新校验并提交」把草稿改基于现值，再走普通的边界移动；仍不合法就保留草稿并写明原因。「放弃草稿」删掉这一条。不提供无条件覆盖。
6. **改时间目前不让任何东西失效（E03）。** 库里没有依赖语段时间的持久对象：没有对齐表，没有声学分析表；`analysis_candidates` 依赖文本图指纹，不依赖时间；`model_runs` 只存计数和一次运行的范围。所以改时间不打复核标记，也不建复核表。将来出现依赖时间的对象，在同一次改动里接上失效规则。`src/db/desktop/schema.test.ts` 的 “lists every unit table with time-shaped columns as reviewed (ADR-0129 E03)” 锁住这一点：带时间形列（`_ms`、`time`、`alignment`、`acoustic`）又指向语段的新表，不在已复核清单里就失败。
7. **删除预览由库在一次读取里给出。** `units.deletePreview` 替代 `units.previewDelete`，按 `deleteUnitTree` 真正删除的内容分类计数：词注、语素、备注、词条链接、分析候选、自定义字段值、未生效草稿（正文与时间码）、采纳记录。确认框用 `ModalPanel`（焦点限制、Esc 等于取消），关闭后焦点回到该语段，计数为 0 的类不显示。`deleteUnitTree` 不碰附件链接，所以预览里也没有这一类。

## 未选方案

- **回执挂在 `units` 外键上**：语段删掉或撤销后回执跟着没了，重放删除就会重做一次。
- **撤销遇到过期一步时静默跳过**：用户以为撤销了，实际改的是更早的一步。
- **冲突草稿直接覆盖正式时间**：后来那次改动会被悄悄冲掉。
- **现在就建复核标记**：没有依赖时间的对象，标了也没人读。

## 影响

- DDL 在 `src/db/desktop/schema.ts`，冻结记录在 `src/db/desktop/formatFreeze.record.json`；回执逻辑在 `src/db/desktop/editReceipts.ts`，客户端查询重发在 `src/db/desktop/client.ts`。
- 撤销阻断在 `src/db/desktop/sessionEdit.ts`；删除预览在 `src/db/desktop/unitEdges.ts`；草稿冲突在 `src/db/desktop/unitTimeDrafts.ts`。
- 界面新增可改键的「切换当前边界」（默认 `E`）：起点 → 终点 → 与下一段共用 → 与上一段共用，共用只在两段相接时出现，状态栏用文字写出当前边界。在波形上按下并拖过 4 像素新建语段，按在已有语段里不新建，否则仍是点按。
