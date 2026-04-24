## 变更摘要 | Summary

- 本 PR 做了什么？

## 落位说明 | Placement

- 新增逻辑主要落在哪一层：`page / controller / hook / service / helper / component`
- 为什么不留在页面或 Orchestrator 层？
- 若本次改动涉及页面级复杂逻辑，是否优先落在 dedicated controller 或 service？

## 浏览器与 Web API | Browser / Web API

- [ ] 若本次引入或强依赖 **较新 / 非普遍的 Web API**（媒体、存储、权限、Worker、剪贴板等），已查 [Can I use](https://caniuse.com/) 或 MDN，优先 **特性检测**；PR 上已跑 **`npm run test:e2e:chromium`**，或在合并前确认 **`npm run test:e2e`**（三引擎，CI 于 `main`/`dev` push 上执行）或注明 **N/A**
- [ ] 策略口径见：`docs/architecture/桌面端浏览器支持策略.md`

## Architecture Guard

- [ ] 已运行 `npm run typecheck`
- [ ] 已运行 `npm test`
- [ ] 已查看 `npm run report:architecture-hotspots`
- [ ] 若影响转写页时间轴，已运行 `npm run gate:timeline-phase1`
- [ ] 未新增 `check:architecture-guard` hard failure

## Timeline 验收 | Timeline Validation

- [ ] 若影响转写页时间轴，已按执行脚本完成手工冒烟：`docs/execution/手工验收执行脚本-转写页时间轴治理门禁-2026-04-03.md`
- [ ] 已附验收证据（截图或录屏链接）

### Hotspot 检查 | Hotspot Check

- 本 PR 是否命中或继续修改 hotspot 文件：`是 / 否`
- 若为 `是`，本 PR 是否已顺手拆分或降复杂度：`是 / 否`
- 若为 `否`，必须填写回收计划与截止迭代：

## 转写轨读作用域 | Transcription lane read scope（ADR 0020）

- [ ] 若本次在 **读 / 展示 / 按轨分组** 路径上按 `unit.layerId` 过滤 **canonical unit**（读模型常无 `layerId`），已使用 `resolveCanonicalUnitForTranscriptionLaneRow` / `buildTimelineUnitViewIndex` 的 `transcriptionLaneReadScope`，或已在 PR 中注明 **N/A**（例如仅处理 `segment` 行、或数据源已保证带轨）
- [ ] 未将「展示用 stamp 的 `layerId`」误用于 **写库 / 协作 / AI 采纳** 路由

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