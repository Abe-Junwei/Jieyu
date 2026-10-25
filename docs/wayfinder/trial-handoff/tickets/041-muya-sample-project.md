---
title: 制作木雅语示例项目（JYM）并接入首启导入
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: [005]
execution_gate: M4
issue: https://github.com/Abe-Junwei/Jieyu/issues/313
---

# 制作木雅语示例项目（JYM）并接入首启导入


<!-- desktop-sqlite-slices:v1:start -->
## 当前可执行切片与关闭条件（2026-10-25 本轮重排）

本单拆清用户材料与工程依赖，不以 #275/#325 关闭作为 B 开工条件。

- A：真实材料由用户本人制作/授权/上传，代理不读取、不上传、不粘贴；其内容规格不变。
- [ ] B1（M4 后，包/单库 API 就绪）：用合成等价 JYM 验证首启导入、重复首启行为、失败不损原项目、重启读回与播放。
- [ ] B2（M6-A）：与交换/备份接口集成，把合成工程证据交 #275；不要求等待本单所有真实材料/发布验收才给这份证据。
- [ ] B3（M7-B）：D14 后由用户完成真实示例最终试用，和 #282 核对含本机转写的核心流程；打包资产与哈希按原流程。

A 不因本次规划被代理领取。#275 使用 B 的工程证据，#282 使用最终试用/发布证据，避免互相等待。


详细前置/验收见[单库切片清单](../../../execution/plans/desktop-project-sqlite-2026-10-25.md#可领取切片与交付顺序2026-10-25-本轮重排)。本轮同步不代表实现完成；下方较早范围保留，冲突以本节为准。
<!-- desktop-sqlite-slices:v1:end -->

## 2026-10-25 已确认范围

用户本人准备材料保持原边界，代理不读真实语料；B 首启导入在 M4 后按白名单开工，属于 #275 首发单库集成输入。D14 前代理验证只用合成项目，不提前导入真实示例。 依据 [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md)、[ADR-0087](../../../adr/0087-project-deletion-retention-and-media-cleanup.md) 和[单库计划](../../../execution/plans/desktop-project-sqlite-2026-10-25.md)。GitHub 已于 2026-10-25 写入当前范围。以下原 Question 留作历史输入，冲突处按本节执行。

## Question

取代 [#256](https://github.com/Abe-Junwei/Jieyu/issues/256)（撒都话候选调研）。用户 2026-10-14 定：公开示例改用本机木雅语料（已获发音人公开授权，CC BY 4.0）。

### A. 制作 JYM（用户本人做，无依赖）

规格：录音 3–5 分钟单声道 WAV；20–40 语段（前一半完整标注，后一半只切分）；词库 30–50 条；元数据含发音人代号、地点与年份、CC BY 4.0、署名、授权记录。用户在解语里导出 JYM，上传为 GitHub Releases 资产 `sample-muya-v*`。代理不读取、不上传、不粘贴任何木雅语料内容。

2026-10-17 用户定：A 不改仓库代码，不受 [ADR-0064](../../../adr/0064-storage-freeze-until-desktop-opens-real-projects.md) 的功能冻结。整张单仍被 #275、#325 挡住，避免冻结期去写 B。

### B. 首启自动导入（依赖 #255、#275）

构建时下载并校验 sha256，打进安装包；首次启动自动导入为项目文件夹。算 [#282](https://github.com/Abe-Junwei/Jieyu/issues/282) 第 3 条门槛。
