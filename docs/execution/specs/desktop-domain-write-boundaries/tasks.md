---
title: desktop-domain-write-boundaries tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-10-26
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

- [x] 诊断必达、字段修订和九类备注去向已写入 ADR-0091。构造点与缺列见后续里程碑规格。产品代码未改。
- [ ] 按 ADR-0091 先实施来源单域的字段并发和诊断补交，再实施备注载体。没有生产构造点的四类不丢弃。
- [ ] R1 字段合同确认后，落实 units.updateText 和 analysis.apply/restore 的共同内部事务；不先接新屏幕回旧端口。
- [ ] M2：合法产物/空文件/错误格式无改写；探针临时夹具与产品目录隔离。
- [x] M3：选择项目后探针调用不改变项目文件。smoke 在主进程检查项目库没有 skeleton_probe。Electron 冒烟未在本机重跑。
- [ ] M4：首次声学绑定与映射修改保留文献秒；播放和转写时间换算验收。
- [ ] M5：来源单域先按 ADR-0091 接字段并发和诊断补交；notes.ts 随后实施。R5/R6 各按独立门禁收口。
- [ ] 需求 §4 的关闭重开及中途失败证据齐，才记对应领域接替完成。

## 本轮验证

- [x] 文档治理、workflow、diff 检查通过；4 文件 27 项旧路径回归通过；smoke 4/4（含 typecheck）通过。
- [x] 本轮仅改文档；生产入口、文件协议、探针隔离及新持久验收均未实施，未关闭远端 issue。
- [ ] 所有实施任务完成后按 ADR-0051 删除本规格。未实施的任务不勾成完成。已确认规则以 ADR-0091 为准。
