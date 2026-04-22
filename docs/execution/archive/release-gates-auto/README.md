# release-gates-auto

本目录存放 **CI / 本地门禁脚本自动写入** 的 Markdown 报告（`M6–M14` 判定或评审结论、协作云 `collaboration-cloud-gate-report-auto.md` 等），与 [../../release-gates/](../../release-gates/) 下的人工清单、runbook 分离，避免 `release-gates/` 根目录噪音过大。

对应脚本：`scripts/evaluate-m6-release-gate.mjs`、`scripts/report-m7-extension-control-gate.mjs` … `scripts/report-m14-collaboration-promotion-gate.mjs`、`scripts/report-collaboration-cloud-gate.mjs`。
