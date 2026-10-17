---
title: 制作木雅语示例项目（JYM）并接入首启导入
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: [005,025,043]
issue: https://github.com/Abe-Junwei/Jieyu/issues/313
---

# 制作木雅语示例项目（JYM）并接入首启导入

## Question

取代 [#256](https://github.com/Abe-Junwei/Jieyu/issues/256)（撒都话候选调研）。用户 2026-10-14 定：公开示例改用本机木雅语料（已获发音人公开授权，CC BY 4.0）。

### A. 制作 JYM（用户本人做，无依赖）

规格：录音 3–5 分钟单声道 WAV；20–40 语段（前一半完整标注，后一半只切分）；词库 30–50 条；元数据含发音人代号、地点与年份、CC BY 4.0、署名、授权记录。用户在解语里导出 JYM，上传为 GitHub Releases 资产 `sample-muya-v*`。代理不读取、不上传、不粘贴任何木雅语料内容。

2026-10-17 用户定：A 不改仓库代码，不受 [ADR-0064](../../../adr/0064-storage-freeze-until-desktop-opens-real-projects.md) 的功能冻结。整张单仍被 #275、#325 挡住，避免冻结期去写 B。

### B. 首启自动导入（依赖 #255、#275）

构建时下载并校验 sha256，打进安装包；首次启动自动导入为项目文件夹。算 [#282](https://github.com/Abe-Junwei/Jieyu/issues/282) 第 3 条门槛。
