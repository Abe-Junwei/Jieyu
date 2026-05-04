# Governance strict — 参数真源（SSOT）

本文件记录 **`npm run check:release-evidence:governance:strict`** 与 CI **full gate strict 分支** 中，除 `package.json` 已写死的通用阈值外，需要 **跨文件保持一致** 的数值。

## 1. `toolDecisionFailureSignals` — rollback 2+ 分桶上限

| 字段 | 当前值 | 含义 |
|------|--------|------|
| CLI | `--max-tool-decision-rollback-2plus=<n>` | `failureSignals.rollbackErrorCountBuckets["2+"]` **不得超过** `n`（含边界）。 |

**当前仓库取值：`n = 5`。**  
用于捕获「多子步 propose 回滚错误」异常堆积；若业务上合法场景会超过 5，由 **产品 / 发布负责人** 发起变更：先更新下表「须同步的文件」，再跑 `npm run gate:release-evidence:governance:strict`。

### 须同步的文件（改 `n` 时逐处替换）

1. `package.json` → `scripts.check:release-evidence:governance:strict` 中的 `--max-tool-decision-rollback-2plus=…`
2. `.github/workflows/ci.yml` → `Release evidence governance gate (full)` 严格分支内联 `node scripts/check-release-evidence-governance.mjs …` 的同一参数
3. `docs/execution/release-gates/release-evidence/README-2026-04-25.md` → Unified strict semantics 与 T4 rollback 小节中的数字说明

## 2. 其它 strict 参数

`--min-approval-total`、`--max-pending-rate` 等仍以 **`package.json` / README** 为准；本文件仅承载 **易在多文件漂移** 的 T4 rollback 上限。
