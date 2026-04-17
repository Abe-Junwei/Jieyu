---
title: OTel 观测灰度与回滚 Runbook
doc_type: execution-release-gate-runbook
status: active
owner: repo
last_reviewed: 2026-04-17
source_of_truth: release-gate-runbook
---

# OTel 观测灰度与回滚 Runbook

适用阶段：OTel + Trace 透传 + conflict_resolved 执行清单 阶段五。

## 1. CI 门禁（自动）

1. 执行入口：`npm run gate:m5-observability`
2. 强制合同：`npm run test:otel-contract`
3. 门禁脚本：
   - `npm run check:m5-observability-foundation`
   - `npm run test:otel-contract`
   - `npm run test:m5-observability-regression`
   - `npm run report:m5-mainpath-success-rate`
   - `npm run report:m5-runtime-latency-samples`
   - `npm run report:m5-trend`
4. CI 作业：`.github/workflows/ci.yml` -> `m5-observability-gate`

## 2. 发布前 Checklist（人工）

1. 在 staging 执行一次真实链路（LLM 请求 + 本地 tool + 错误路径）。
2. 确认 collector 收到 trace，且包含：
   - `service.name`
   - `deployment.environment(.name)`
   - 自定义属性白名单（例如 `gen_ai.jieyu.tool_name`）
3. 确认错误路径 span 结束状态为 `ERROR`。
4. 确认 OTel 属性脱敏生效：
   - 密钥字段被替换为 `[REDACTED]`
   - prompt/content 仅记录长度
   - URL query 中 token/key 被脱敏

## 3. 灰度策略

1. 灰度顺序：内部用户 100% -> beta 用户 10% -> 全量 1%~5%。
2. 控制开关：
   - `VITE_OTEL_EXPORT_ENABLED`
   - `VITE_OTEL_INJECT_TRACE_CONTEXT_HEADERS`
3. 放量前提：连续两个发布窗口无 P0（collector 不可达导致主链路异常、导出阻塞 UI、PII 泄露）。

## 4. 回滚触发条件

1. collector 写入失败持续升高且触发熔断。
2. span attribute 基数失控导致后端资源异常。
3. 发现 PII/密钥未脱敏样本。
4. header 注入触发第三方服务兼容问题。

## 5. 回滚顺序

1. 先关闭 `VITE_OTEL_INJECT_TRACE_CONTEXT_HEADERS`（仅停透传）。
2. 再关闭 `VITE_OTEL_EXPORT_ENABLED`（停导出，保留主功能）。
3. 若仍异常，回滚到上一稳定版本。

## 6. 记录与归档

1. 记录本次 runId、时间窗、放量比例与异常摘要。
2. 将关键结论回填到发布报告与对应 milestone 门禁文档。
