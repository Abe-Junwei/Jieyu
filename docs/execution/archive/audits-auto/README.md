# audits-auto

本目录存放 **脚本自动写入** 的审计类 Markdown（当前为 M2 主路径行为对比报告），与 [../../audits/](../../audits/) 下的人工审计、基线说明分离。

生成入口：`scripts/generate-m2-behavior-report.mjs`（可通过环境变量 `M2_BEHAVIOR_REPORT_PATH` 覆盖输出路径，但仍须落在仓库根目录内）。
