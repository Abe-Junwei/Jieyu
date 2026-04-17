---
title: OTel 灰度与回滚 Runbook
doc_type: execution-release-gate-runbook
status: superseded
superseded_by: OTel-观测灰度与回滚-runbook-2026-04-17.md
owner: repo
last_reviewed: 2026-04-17
source_of_truth: release-gate-runbook
---

# OTel 灰度与回滚 Runbook

## 目标

1. 为 OTel + Trace 透传提供可执行的灰度放量与回滚手册。
2. 将 CI 门禁、产品回归和发布前人工检查分层，避免口径混淆。

## 适用范围

1. 前端浏览器侧 OTel 导出链路。
2. LLM、tool、agent 相关自定义 span 观测链路。
3. conflict_resolved 等协作日志与观测联合放行场景。

## 术语约定

1. OTel 合同门禁：npm run test:otel-contract。
2. 产品回归门禁：npm run test:e2e。
3. 发布前人工检查：staging 人造负载 + collector 收包 + 看板核验。

## 门禁分层

| 类型 | 内容 | 执行方式 |
|------|------|----------|
| CI 门禁 | npm run test:otel-contract + npm run typecheck + npm run build | 自动，PR 必过 |
| 产品回归 | npm run test:e2e | 自动，验证产品功能不退化 |
| 发布前 checklist | staging 人造负载 -> collector 收包 -> Grafana 核验 | 手动，发布经理确认 |

## 灰度放量策略

1. 内部用户：100% 采样，持续观察 exporter 成功率与错误率。
2. beta 用户：10% 采样，按租户或项目 allowlist 放量。
3. 全量阶段：1% 到 5% 采样，按小时观察趋势后再扩大。

## 自动回滚触发条件

1. OTel 导出连续失败超过阈值且熔断触发次数持续上升。
2. collector 侧出现资源告警（如 OOM 或持续高延迟）。
3. 合同测试出现以下任何失败：
   1. exporter 未收到 span。
   2. 缺失 service.name 或 deployment.environment。
   3. 关键属性不符合属性字典约束。
   4. 错误路径 span 未以 ERROR 结束。

## 回滚顺序

1. 关闭 trace header 注入开关（VITE_OTEL_INJECT_TRACE_CONTEXT_HEADERS=false）。
2. 关闭 OTel 导出开关（VITE_OTEL_EXPORT_ENABLED=false 或 VITE_ENABLE_OTEL=false）。
3. 回滚新增埋点代码到上一个稳定版本。

## 发布前人工 Checklist

1. 在 staging 触发至少一次 LLM、tool、agent 主链路。
2. 确认 collector 收到 span 且资源属性完整。
3. 确认敏感字段已脱敏，不出现 token、api key、raw prompt。
4. 确认错误路径 span 状态为 ERROR。
5. 确认协作冲突链路有 conflict_resolved 且可追溯。

## 记录模板

1. 发布批次：
2. 灰度范围：
3. 采样率：
4. 观测窗口：
5. 是否触发回滚：
6. 回滚步骤执行结果：
7. 复盘结论：
