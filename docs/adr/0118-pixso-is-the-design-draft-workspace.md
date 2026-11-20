---
title: ADR 0118 - 页面精稿改在 Pixso，变量从代码单向同步
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-19
source_of_truth: decision-record
depends_on:
  - ./0102-desktop-design-drafts-move-to-open-design.md
  - ./0106-design-system-package-lives-in-repo.md
  - ./0109-design-system-no-info-blue-noto-ipa-and-menu-target.md
---

# ADR 0118：页面精稿改在 Pixso，变量从代码单向同步

## 背景

2026-11-17 已把 Open Design 里的规范页搬到 Pixso 文件 `va44BZLBUSYRQ7KoiO3PJw`，共 25 张画板、98 个变量、13 个样式。评审时发现三件事：

- 5742 个节点没有一个绑定变量或样式，暗色画板是手工复制的另一份。
- 文件里没有可复用组件。
- Pixso 不在任何 ADR 里。[ADR-0102](./0102-desktop-design-drafts-move-to-open-design.md) 当时把它列为未选方案。

Pixso 云端字体里没有正体 Noto Sans，也没有 Noto Sans Mono 和 Noto Serif SC。它的本地字体助手只能让装了字体的那台机器显示这些字体。

## 决定

1. **页面精稿在 Pixso 画。** 取代 ADR-0102 第 1 条中的「Open Design」。Open Design 停用，已有转写主稿只作参考、不再维护。ADR-0102 第 3 条（稿件只用合成数据，导出 HTML 不进代码）对 Pixso 同样适用。
2. **值的真源仍是 `src/styles/tokens.css`，只单向同步到 Pixso。** `npm run build:od-tokens` 增加一份 Pixso 变量清单。代理通过 Pixso MCP 的 `write_variables` 写入。`tokens.css` 改了而清单没重新生成时，`check:docs-governance` 失败。不在 Pixso 里新建或改值。
3. **Pixso 只放 `DESIGN.md` 规定的语义变量。** 生成脚本列出 Open Design 专用的排除项，暗色作为同一变量集的第二个模式。阴影存不进 Pixso 变量，改为亮、暗各一份效果样式。Pixso 不渲染阴影的扩散值，所以焦点外环和输入焦点晕不做效果样式，在组件里画成绑定变量的描边环图层。设计包里的移动端间距变量、同值字号别名，以及代码里同为 8px 的圆角别名一并删除。
4. **组件库覆盖 `DESIGN.md` 的全部通用组件**，领域组件（时间轴片段、IGT 单元、查询构建器）以后再做。组件名写「中文 / 代码名」，变体轴和取值用代码组件 props 的英文名。
5. **规范画板用组件实例拼成，全部绑定变量和样式。** 暗色副本已删，暗色用变量模式切换。文件 `va44BZLBUSYRQ7KoiO3PJw` 只有下面三页，没有名为「规范」的页。页名和 pageId 以这一条为准：

   | 页 | pageId | 放什么 |
   | --- | --- | --- |
   | 设计系统 | `0:1` | 规范画板（颜色、字号、时间轴、播放等）。本条原先写的「规范」页就是这一页 |
   | 组件 | `11:29132` | 可复用组件 |
   | 精稿 | `19:6184` | 页面精稿。转写标准帧是 `19:6187`（「01 转写 · 样态 · 标准」） |

   复制或新建画板之后，父页必须是上表里的目标页。插件当前页经常停在「设计系统」，`clone()` 会落在当前页；精稿不能留在那里。
6. **规则正文仍是 `design/jieyu-paper/DESIGN.md`。** `preview/` 组件预览页在 Pixso 组件页完成后退役。取代 [ADR-0106](./0106-design-system-package-lives-in-repo.md) 第 1 条和第 5 条里 Open Design 软链接的部分；第 2、3 条不变。
7. **字体用 Pixso 云端已有的替身。** 界面用 Noto Sans SC，音标用 Noto Sans SemiCondensed，时间码用 JetBrains Mono，衬线用 Source Han Serif CN（与 Noto Serif SC 同一设计）。替身写在生成脚本里，`--font-*` 变量和文字样式都用它。代码里的字体栈不变。替身字面宽度和产品不同，精稿上的列宽和片段容量只作近似，以代码渲染为准。

## 未选方案

- **Pixso 只做只读镜像，精稿留在 Open Design**：组件没处可用，两套工具各自漂移。
- **Pixso 和 Open Design 并行画稿**：同一页面两份稿，没有裁决规则。
- **在 Pixso 里维护变量值**：会出现第二个值的真源。
- **上传字体到 Pixso 团队字体库**：协作者能直接看到正确字体，但这次没有选。
- **Pixso 本地字体助手**：能显示真字体，但只对装了字体的机器生效，还要多装一个常驻程序。

## 影响

- 执行计划见 `docs/execution/plans/pixso-design-workspace-2026-11-17.md`。
- `DESIGN.md` 第 10 节、开头的设计包说明，以及 `AI_QUICKSTART.md` 的精稿路由，在 Pixso 组件页落地时同步改。
- 应用本身目前没有 `@font-face`，也没有打包字体文件，和 ADR-0109「随应用打包」不符。这件事另开任务处理，不在本条范围内。
