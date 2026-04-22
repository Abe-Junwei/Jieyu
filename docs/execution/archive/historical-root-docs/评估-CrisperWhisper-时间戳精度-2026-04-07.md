> 文档角色：评估结论文档。本文用于记录 CrisperWhisper 时间戳方案在 2026-04-07 的当前决策，不作为运行时设计文档。

# 评估-CrisperWhisper-时间戳精度

> 评估日期：2026-04-07
> 对照规划：docs/规划-语音智能体架构设计方案-2026-03-18.md A8.6 P2-1
> 当前结论：暂不接入产品运行时，保留为研究候选方案

---

## 一、评估目标

原规划希望把 CrisperWhisper 作为“精确词级时间戳”候选方案，用于 `SpeechAnnotationPipeline` 的词边界回写，并以以下指标决定是否推进接入：

1. 词级时间戳 MAE
2. 边界检测 F1@50ms / F1@25ms
3. 语种覆盖率

同时，规划要求若结论足够好，再引入 `timestampProvider` 抽象，而不是先接运行时代码再补评估。

---

## 二、本轮新增资产

本轮没有新增 CrisperWhisper 运行时代码，而是先把评估闭环落到仓库里：

1. 新增时间戳评测工具 [src/ai/perf/timestampEvalUtils.ts](../../../../src/ai/perf/timestampEvalUtils.ts)
2. 新增时间戳评测测试 [src/ai/perf/timestampEvalUtils.test.ts](../../../../src/ai/perf/timestampEvalUtils.test.ts)
3. 新增评测入口 `npm run perf:timestamp-eval`

评测工具直接复用了仓库现有的 [src/types/alignmentTask.ts](../../../../src/types/alignmentTask.ts) 中 `AlignmentInterval` 结构，避免未来接入任何 provider 时再做第二次格式迁移。

当前评测工具覆盖的指标是：

1. 词级起止时间 MAE（ms）
2. 综合边界 MAE（ms）
3. 边界检测 F1@25ms / F1@50ms
4. 文本 WER
5. 样本覆盖率与语言覆盖率

---

## 三、当前结论

本轮结论不是“精度不够”，而是“当前不应推进产品接入”。原因有两层：

1. 仓库中仍没有 CrisperWhisper 本地服务或远程 provider，实现层面尚无可接入对象。
2. 架构文档已记录 CrisperWhisper 许可为 `CC-BY-NC-4.0`，存在非商用限制；在未单独确认分发边界前，不适合作为当前产品默认能力推进。

因此，本轮决策是：

1. 不新增 `timestampProvider` 抽象。
2. 不新增 CrisperWhisper provider/runtime。
3. 先保留时间戳评测工具与报告，作为未来研究性复评入口。

这意味着 CrisperWhisper 当前属于“有明确负向决策的研究候选”，而不是“继续悬空等待接入”的任务。

---

## 四、何时重新打开此项

只有同时满足下面条件，才值得重新评估是否推进接入：

1. 许可边界被明确确认为可接受，或仅在受控研究环境中使用。
2. 存在可稳定调用的 CrisperWhisper 服务形态（本地或远程）。
3. 基于不少于 10 组多语言样本，跑出真实指标并满足规划门槛：
   当前仓库已具备指标工具，但尚未对真实 CrisperWhisper 输出执行该批次 benchmark。

若未来重开，建议流程为：

1. 导出 ground-truth 词级边界为 `AlignmentInterval[]`
2. 将 CrisperWhisper 输出转换成相同结构
3. 用 [src/ai/perf/timestampEvalUtils.ts](../../../../src/ai/perf/timestampEvalUtils.ts) 计算 MAE / F1 / 覆盖率
4. 只有在指标与许可同时过关时，才进入 `timestampProvider` 设计

---

## 五、当前判定

截至 2026-04-07，CrisperWhisper 这项的当前判定是：

1. 评测工具：已具备
2. 运行时接入：不推进
3. 产品默认链路：不进入
4. 后续状态：研究候选，待未来在受控条件下复评