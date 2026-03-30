## 变更摘要 | Summary

- 本 PR 做了什么？

## 落位说明 | Placement

- 新增逻辑主要落在哪一层：`page / controller / hook / service / helper / component`
- 为什么不留在页面或 Orchestrator 层？
- 若本次改动涉及页面级复杂逻辑，是否优先落在 dedicated controller 或 service？

## Architecture Guard

- [ ] 已运行 `npm run typecheck`
- [ ] 已运行 `npm test`
- [ ] 已查看 `npm run report:architecture-hotspots`
- [ ] 未新增 `check:architecture-guard` hard failure

### Hotspot 检查 | Hotspot Check

- 本 PR 是否命中或继续修改 hotspot 文件：`是 / 否`
- 若为 `是`，本 PR 是否已顺手拆分或降复杂度：`是 / 否`
- 若为 `否`，必须填写回收计划与截止迭代：

## 结构检查 | Structural Checklist

- [ ] 未把数据库写入、异步编排、跨状态协调继续留在页面 / Orchestrator
- [ ] 未新增成簇业务回调堆积在页面层
- [ ] 若有结构性拆分，已补 focused tests
- [ ] 若有结构性拆分，已补结构守卫 / 文档更新

## 风险与回滚 | Risk & Rollback

- 主要风险：
- 回滚方式：

## 验证 | Validation

- 手工验证：
- 自动验证：