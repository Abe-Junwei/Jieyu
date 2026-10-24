---
layout: home
title: 解语使用说明
titleTemplate: false

hero:
  name: 解语
  text: 使用说明
  tagline: 给做濒危语言调查和整理的人。一次田野工作留在同一套本地工作区里。
  actions:
    - theme: brand
      text: 录音与转写
      link: /recording
    - theme: alt
      text: 开发者文档（DeepWiki）
      link: https://deepwiki.com/Abe-Junwei/Jieyu

features:
  - title: 录音与转写
    details: 导入媒体、波形与时间轴、VAD/手动切段、翻译层录音、播放与快捷键。
    link: /recording
  - title: 标注与 IGT
    details: 在标注工作台做词切分、gloss、词素、词典链接与句段播放。
    link: /annotation
  - title: 词典
    details: 词条与义项、LIFT/DMLex 交换、从转写命中回链。
    link: /lexicon
  - title: 语料库
    details: 临时工作集、筛选、复制与打包下载（不写回转写）。
    link: /corpus
  - title: 导入导出与备份
    details: EAF/TextGrid/JYT/JYM/JYB 等交换与备份；档案建档另见占位说明。
    link: /export
  - title: 设置与快捷键
    details: 主题、播放默认、以及应用内可查的快捷键一览。
    link: /settings
---

## 怎么读本站

解语是桌面应用方向的田野工作台。一条材料在本地工作区里大致按这个顺序往下走：

**录音 → 转写 → 标注 → 词典 → 语料库 → 导出/备份。**

侧栏主要入口（应用内文案）：**首页**、**转写**、**标注**、**词典**、**语料库**、**分析**（受限），以及资产侧的语言元数据 / 正字法 / 正字法桥接等。

按专题深入时用下表：

| 你想…… | 打开 |
| --- | --- |
| 把导入、切段、播放、层录音做细 | [录音与转写](/recording) |
| 做行际标注（IGT） | [标注与 IGT](/annotation) |
| 收词、导入导出词表 | [词典](/lexicon) |
| 多选句段做临时工作集 | [语料库](/corpus) |
| 导出 EAF / 备份 JYB 等 | [导入导出与备份](/export) |
| 改主题、快捷键、播放默认 | [设置与快捷键](/settings) |
| 查冻结与协作边界 | [协作与同步冲突](/collaboration)、[常见问题](/faq) |

本站按钮名称以当前中文界面文案为准（见仓库 `src/i18n/dictionaries/zh-CN.ts`）。菜单像素位置可能随版本微调，以你安装的版本为准。

公开安装包下载步骤尚未写入本站；从源码启动见仓库 [README](https://github.com/Abe-Junwei/Jieyu/blob/main/README.md)。

开发者文档在 [DeepWiki](https://deepwiki.com/Abe-Junwei/Jieyu)。本站是使用者说明，两边各看各的。

### 诚实边界（请先读）

- **桌面存储冻结（[ADR-0064](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0064-storage-freeze-until-desktop-opens-real-projects.md)）**：冻结期不承诺新的档案建档流程；交换格式导出（EAF 等）与项目备份（JYT/JYM/JYB）以应用内「导入与导出」菜单为准，见 [导入导出与备份](/export)。
- **协作同步**：跟踪 [GitHub #342](https://github.com/Abe-Junwei/Jieyu/issues/342)，本站只给边界说明，不写未落地的冲突操作教程。
- **词典附件、部分 AI/分析能力**：默认关闭的功能开关不会当作已交付教程展开。
