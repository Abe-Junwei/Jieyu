# M8 协作演进 RC 评审报告（自动生成）

- 生成时间：2026/4/14 17:13:04
- 模式：enforce
- 结论：go

## 指标评估结果

| 指标 | 阈值 | 当前值 | 判定 |
|---|---:|---:|---|
| conflict_detection_rate | 100% | 100.00% (4/4) | PASS |
| consistency_after_resolution_rate | >= 99.90% | 100.00% (1/1) | PASS |
| resolution_contract_pass_rate | 100% | 100.00% (2/2) | PASS |

## 分级门禁发现

- P0（阻断）数量：0
- P1（灰度）数量：0
- P2（观察）数量：0

## 判定语义

1. enforce 模式：存在任一 P0 即 no-go 并返回非零退出码。
2. shadow 模式：存在 P0 仅告警，不阻断流水线。
3. RC 阶段要求冲突可检测率=100%，一致率>=99.9%，P0=0。

