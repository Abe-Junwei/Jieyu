---
title: desktop-domain-write-boundaries tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-10-25
source_of_truth: desktop-domain-write-boundaries-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — 边界收口与实施门禁

## 本轮文档交付

- [x] 核对审计双连接、备注目标解析、探针宿主路径与声学绑定旧断言。
- [x] 写正文原子操作、代际当前值归属、审计取舍草案与九类备注清单。
- [x] 把探针隔离放 M2/M3、声学坐标放 M4、备注/审计放相应领域前，M1 不变。
- [x] 标记附件清除后的持久收尾依据仍待 R5；纠正旧 accepted 唯一索引草案。

## 后续决定与实施（本轮未执行）

- [ ] 审计：逐操作区分必要业务记录与本机诊断，确认成功/失败及是否必达；涉及承诺变更再写新 ADR。
- [ ] 备注：九类各补可达入口证据及去向；未映射能力不可直接取消，词典扩展需核对完整数据。
- [ ] R1 字段合同确认后，落实 units.updateText 和 analysis.apply/restore 的共同内部事务；不先接新屏幕回旧端口。
- [ ] M2：合法产物/空文件/错误格式无改写；探针临时夹具与产品目录隔离。
- [ ] M3：Electron 中选择项目后探针调用不会改变项目，原 smoke 改用独立夹具。
- [ ] M4：首次声学绑定与映射修改保留文献秒；播放和转写时间换算验收。
- [ ] M5：审计按新决定接替；notes.ts 在目标合同确定后实施；R5/R6 各按独立门禁收口。
- [ ] 需求 §4 的关闭重开及中途失败证据齐，才记对应领域接替完成。

## 本轮验证

- [x] 文档治理、workflow、diff 检查通过；4 文件 27 项旧路径回归通过；smoke 4/4（含 typecheck）通过。
- [x] 本轮仅改文档；生产入口、文件协议、探针隔离及新持久验收均未实施，未关闭远端 issue。
- [ ] 所有实施任务完成后按 ADR-0051 删除本规格；未决内容不冒充 accepted ADR。
