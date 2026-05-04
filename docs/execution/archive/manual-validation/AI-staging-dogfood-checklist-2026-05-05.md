# AI 能力 — Staging / 内部 dogfood 清单（2026-05-05）

用途：在 **非生产** 环境做小流量验证，避免默认配置污染生产语义。与《[release-evidence README](../../release-gates/release-evidence/README-2026-04-25.md)》中 **T4-c** 约定一致。

## 1. 环境前提

- [ ] 构建/部署目标为 **staging** 或 **内部渠道**（非对外生产域名）。
- [ ] 变更已走独立分支，可一键回滚。

## 2. T4-c：执行器单次自动重试

- **Flag**：`aiToolCallExecutorAutoRetryEnabled`（`src/ai/config/featureFlags.ts`，默认 `false`）。
- [ ] 仅在 staging 置为 `true`；记录 **起止时间** 与 **观察人**。
- [ ] 关注：幂等、destructive gate、确认路径是否出现异常重复写。
- [ ] 验证结束后 **恢复 `false`**。

## 3. 周期性观测（建议每周或每个发布周期）

在包含 AI 审计导出的工作区执行：

```bash
npm run gate:release-evidence:governance
# 发布前收紧：
npm run gate:release-evidence:governance:strict
npm run check:agent-evals:trace
```

- [ ] `toolDecisionFailureSignals` 与 `costGuard.trend` 无意外跳变（与上周报告或 ndjson fixture 对比）。
- [ ] 若 strict 失败：先区分 **数据质量** vs **回归**，再调阈值见 [STRICT-GOVERNANCE-PARAMS.md](../../release-gates/STRICT-GOVERNANCE-PARAMS.md)。

## 4. 记录

| 日期 | 环境 | 项 | 结果 / 链接 |
|------|------|-----|------------|
| （人工填写） | | | |
