# Agent evals（`scripts/agent-evals`）

本目录存放 **agent governance 回归套件** 的配置（当前为 `suite.v1.json`），由 `scripts/run-agent-evals.mjs` 读取并执行。

## `goldenTaskCount` 是什么

- 在每个 **case**（`suite.v1.json` 的 `cases[]`）上标注一个 **非负整数**，表示该 case 在门禁里贡献的「黄金任务权重」。
- Runner 会把各 case 的 `goldenTaskCount` **加总**，与 `thresholds.requiredGoldenTasksMin` 比较；**不是**「独立黄金用例条数」或「独立轨迹样本数」。
- 若需要对外沟通「真实样本量」，应以各 case 实际执行的 Vitest/命令所覆盖的用例为准，或单独维护轨迹级评测清单。

## `trajectorySignals` 是什么

- 每个 case 可声明一组字符串标签；runner 会对全 suite **去重合并**，再与 `thresholds.requiredTrajectorySignals` 做 **集合包含**检查。
- 当前语义是 **元数据层面的信号覆盖**（声明「本 case 意在覆盖哪些治理维度」），**不是**对真实工具调用轨迹的自动解析或评分。

## 命令入口（`package.json`）

| 脚本 | 行为 |
|------|------|
| `npm run report:agent-evals` | shadow 模式写报告，不因阈值失败退出 |
| `npm run check:agent-evals` | enforce：跑 suite + 阈值，失败则 `exit 1` |
| `npm run check:agent-evals:trace` | 在 enforce 基础上追加 `--assert-audit-trace=docs/execution/audits/ai-tool-decision-audit-export-v1.ndjson`，对 **已提交的审计 NDJSON** 做最小结构断言 |

## `--assert-audit-trace`（可选）

传给 `node scripts/run-agent-evals.mjs`：

```bash
node scripts/run-agent-evals.mjs --mode=enforce --assert-audit-trace=path/to/export.ndjson
```

启用后，除原有 case 阈值外，还会校验导出中至少存在可解析的 `ai_tool_call_decision` 行，且存在带 `phase=decision` 与非空 `outcome` 的 metadata（详见 `scripts/run-agent-evals.mjs` 与 `scripts/run-agent-evals.test.ts`）。

## CI

默认 PR/push 只跑 `check:agent-evals`。若要在 CI 上追加 trace，可在 **手动** `workflow_dispatch` 中勾选 `.github/workflows/ci.yml` 的 `run_agent_evals_audit_trace`（见该 workflow 注释与输入说明）。
