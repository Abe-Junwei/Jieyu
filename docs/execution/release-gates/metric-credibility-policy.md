# 指标可信度政策 | Metric Credibility Policy

## 1. 目标

确保 AI 性能指标和成本基线在样本不足、窗口过期或环境变化时不被误用为稳定结论。

## 2. 样本阈值

| 指标类型 | 最小样本数 | 测量窗口 | 结论标签 |
|---------|-----------|---------|---------|
| workflow 成本基线 | 10 | 7 天 | stable / partial / stale |
| citation accuracy | 5 | 单次发布周期 | stable / partial |
| agent-evals 语义 case | 30 | 单次发布周期 | stable |

## 3. 结论降级规则

- **stable**：样本数 ≥ 最小样本数，且在测量窗口内，环境无显著变化。
- **partial**：样本数 < 最小样本数，或超出测量窗口但在 2 倍窗口内。
- **stale**：超出 2 倍测量窗口，或环境发生 breaking change（如模型切换、schema 升级）。

## 4. 强制行为

- `partial` 结论不得用于发布门禁的最终判定。
- `stale` 结论必须触发基线重测或数据归档。
- 任何 schema 变更（如 EvidencePacketV0 → V1）自动将所有依赖指标标记为 stale。
