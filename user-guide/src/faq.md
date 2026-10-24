---
title: 常见问题
---

# 常见问题

## 本站和 DeepWiki 各看什么？

本站是使用者的使用说明。开发者文档在 [DeepWiki](https://deepwiki.com/Abe-Junwei/Jieyu)：架构、ADR 和实现。仓库里的 `docs/` 也是工程师文档。使用说明源码在仓库 `user-guide/`。

## 为什么以前感觉「太水」？现在哪些页写细了？

对照成熟田野工具（ELAN / FLEx / Audacity / SayMore）的文档角度，并按**当前代码与中文文案**扩写了：

| 页 | 状态 |
| --- | --- |
| [快速开始](/getting-started)、[录音与转写](/recording) | 教程体 + 格式/时长限制 + VAD 参数 + 层录音 |
| [标注与 IGT](/annotation)、[词典](/lexicon)、[语料库](/corpus) | 按已默认开放的工作台写步骤 |
| [导入导出与备份](/export) | 写清已上线的交换/备份菜单；建档仍占位 |
| [设置与快捷键](/settings) | 设置标签 + 默认快捷键表 |
| [协作与同步冲突](/collaboration) | 诚实占位（#342） |

## 英文页在哪里？

顶栏可切到 English。英文站目前只有 [占位页](/en/)，正文以简体中文为准。应用内可在 **设置 → 语言** 切换界面语言。

## 网页打不开怎么办？

站点地址是 <https://abe-junwei.github.io/Jieyu/>。

维护者在 GitHub → Settings → Pages → Build and deployment，把 Source 设为 **GitHub Actions**。步骤见仓库 `user-guide/README.md`。地址若不一致，以 Pages 设置页为准，并同步修改 `user-guide/.vitepress/config.mjs` 里的 `base`。

## 数据在哪？会不会丢？

一次田野工作的录音、转写、标注和词典留在本机当前项目。浏览器构建清站点数据可能导致看不到原项目。重要材料请用 [导入导出与备份](/export) 导出 JYT/JYM/JYB。协作云同步见 [协作与同步冲突](/collaboration)。

## 没有安装包怎么上手？

公开安装包下载步骤尚未写入本说明。开发与试用可按仓库 [README](https://github.com/Abe-Junwei/Jieyu/blob/main/README.md) 执行 `npm run dev`。产品目标是桌面应用；浏览器构建主要用于开发与测试（[ADR-0064](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0064-storage-freeze-until-desktop-opens-real-projects.md)）。

## 支持哪些媒体格式？波形有上限吗？

导入对话框：**MP4、MP3、WAV、WebM、MOV、MKV、OGG、M4A、FLAC**。  
波形解码保护：约 **>512 MiB** 或 **>3 小时** 可能跳过波形或拒绝导入（文字时间轴仍可能可编辑）。详见 [录音与转写](/recording)。

## 标注 / 词典 / 语料库进不去？

- 标注、语料库默认开启；若你的构建用环境变量关掉，会看到「未开放」占位。  
- 词典需先打开项目。  
- 分析页可能显示「受限工作台」，入门可不依赖它。

## 导出和「建档」是一回事吗？

不是。EAF、JYM、JYB 等**交换与备份**已在转写台菜单里；面向档案馆的**建档**流程仍占位（ADR-0064）。见 [导入导出与备份](/export)。

## 快捷键在哪查？

[设置与快捷键](/settings)。转写台也可看备注按钮上的 ⌘⇧N 等提示。
