---
name: Jieyu Qingmo
colors:
  surface: '#f4f5ee'
  surface-dim: '#eaebe4'
  surface-bright: '#fcfcf8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fcfcf8'
  surface-container: '#f4f5ee'
  surface-container-high: '#eaebe4'
  surface-container-highest: '#d6d8ce'
  on-surface: '#062e33'
  on-surface-variant: '#083d44'
  inverse-surface: '#062e33'
  inverse-on-surface: '#fcfcf8'
  outline: '#b8bdb0'
  outline-variant: '#d6d8ce'
  surface-tint: '#026370'
  primary: '#026370'
  on-primary: '#fcfcf8'
  primary-container: '#eaebe4'
  on-primary-container: '#083d44'
  inverse-primary: '#e5ff97'
  secondary: '#3d5554'
  on-secondary: '#fcfcf8'
  secondary-container: '#eaebe4'
  on-secondary-container: '#1a4549'
  tertiary: '#5c706c'
  on-tertiary: '#fcfcf8'
  tertiary-container: '#e5ff97'
  on-tertiary-container: '#083d44'
  error: '#dc2626'
  on-error: '#ffffff'
  error-container: '#fef2f2'
  on-error-container: '#b91c1c'
  primary-fixed: '#eaebe4'
  primary-fixed-dim: '#d6d8ce'
  on-primary-fixed: '#062e33'
  on-primary-fixed-variant: '#026370'
  secondary-fixed: '#eaebe4'
  secondary-fixed-dim: '#d6d8ce'
  on-secondary-fixed: '#062e33'
  on-secondary-fixed-variant: '#3d5554'
  tertiary-fixed: '#e5ff97'
  tertiary-fixed-dim: '#d6d8ce'
  on-tertiary-fixed: '#083d44'
  on-tertiary-fixed-variant: '#026370'
  background: '#f4f5ee'
  on-background: '#062e33'
  surface-variant: '#eaebe4'
typography:
  display-lg:
    fontFamily: Noto Serif SC
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: '0'
  body-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: '0'
  body-bold:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: '0'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  linguistic:
    fontFamily: Charis SIL
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: '0'
rounded:
  sm: 4px
  DEFAULT: 8px
  md: 8px
  lg: 10px
  xl: 12px
  full: 999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 12px
  margin-mobile: 16px
  margin-desktop: 24px
components:
  sentence-sheet:
    backgroundColor: '{colors.surface-container-lowest}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.lg}'
    padding: 12px
  line-label:
    backgroundColor: '{colors.surface-bright}'
    textColor: '{colors.on-surface-variant}'
    typography: '{typography.label-caps}'
    padding: 4px
  word-cell:
    backgroundColor: '{colors.surface-bright}'
    textColor: '{colors.on-surface}'
    typography: '{typography.linguistic}'
    rounded: '{rounded.sm}'
    padding: 6px
  context-menu:
    backgroundColor: '{colors.surface-container-lowest}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.md}'
    padding: 4px
---

# Design System: Jieyu Qingmo

## Overview

解语是给田野语言学用的本机工作台。默认外观叫「青墨纸本」：冷纸底、青绿主操作、青墨正文。柠绿 `#E5FF97` 只作次强调，不铺大面积，不进正文。

这次要重新设计的是标注页工作台，不是转写时间轴，也不是词典页。气质是安静的纸面行间标注：词和注释对齐成列，操作收到菜单里。不要做成仪表盘、卡片墙、节点连线图，也不要做成带许多常驻输入框的表单。

界面语言用中文。语言学术语（gloss、POS、ISO 639-3）可以留在格子内容里，不作为按钮文案。

## Colors

纸底是 `background` `#F4F5EE`。句子纸面和菜单用 `surface-container-lowest` `#FFFFFF`。顶栏和行标签底用 `surface-bright` `#FCFCF8`。

正文是青墨 `on-surface` `#062E33`。行名、时间、次要说明用 `on-surface-variant` `#083D44`。

主操作是青绿 `primary` `#026370`，字用 `#FCFCF8`。选中的译文层、当前聚焦句、菜单里选中的小点，都用这一个青绿。

柠绿 `tertiary-container` `#E5FF97` 只用于建议占位、信息洗底。建议还没确认时用这个洗底，确认后回到纸面。

警告用 `#FFFBEB` 底、`#92400E` 字。删除和失败用 `error` `#DC2626`，底 `#FEF2F2`。

边框只用两档：行与行、句与句用 `outline-variant` `#D6D8CE`；聚焦句和菜单用 `outline` `#B8BDB0`。同一条视线里，带边框的容器最多两层。更深的格子用底色差和间距分开，不再加框。

## Typography

界面用 Inter，中文落到 Noto Sans SC。行间的词、语素、注释用 Charis SIL（没有时用 Noto Serif），和界面字分开，这样语言形式一眼能辨认。

字号固定，不提供界面放大缩小：

- 页标题 16px / 600
- 正文与格子 14px
- 语言形式 15px
- 行名、时间、说话人 12px / 500

时间码可用 JetBrains Mono，12px。不要用超大展示字号。不要把整页字号做成可拖的缩放。

## Layout

桌面优先，宽度按 1280px 画一屏。左侧是 52px 的应用轨，不在这一稿里重做。标注工作台占剩余宽度。

工作台自上而下：

1. 一条低顶栏。左：小徽章「标注」、标题、一句说明。右：返回转写的文字链接；若有多层自由译文，一个下拉选择当前译文层。直译层不出现在这个下拉里。
2. 一条工具条，贴在列表上方，不要单独做成第三块带边框的卡片。内容：检索（可在句子 / 词 / 语素之间切换）、排除不合语法、字符变体登记、三个只读开关（波形、频谱、音高）。结构模板和导出放在工具条右侧的文字动作里，不占主视线。
3. 句子列表。一句一张纸。纸与纸之间 12px。空列表、加载、错误各是纸上的一句说明，不要插画空态。

一句纸的内部：

- 顶上一行元信息：起止时间、说话人姓名。没有说话人就留空。右侧是句子菜单，三个竖排小点，始终在内容右侧。
- 下面是行间表。左边一列行名，宽约 72px。右边是内容。
- 行名右侧紧跟一个小点菜单，默认透明，悬停、键盘焦点或拖动时才显现。小点紧贴行名，不跑到行尾。
- 默认可见行，从上到下：原文、词、标注、词性、译文。语素形式、词目、直译默认可以不出现，从行菜单添加。
- 原文和译文、直译是整句一条，不分词。词、语素形式、标注、词性、词目按词对齐成列。一个词一列，列宽随词面走，列与列间隙 8px。
- 原文可以有多行（不同语言）。所有原文都在词的上面。标注和词性也可以有多行。直译和译文在最下面，直译在译文之上。
- 聚焦的一句可以在行间下面展开该句时间范围内的波形、频谱、音高。这三块只读，不进入行间格子，不改变词的时间。默认收起，由工具条开关打开。

行名用这些中文：原文、词、语素形式、标注、词性、词目、直译、译文。语言行在行名后加语言，例如「原文 · eng」。

示例一句（虚构，只为排版）：

| 行 | 内容 |
| --- | --- |
| 原文 | The boy went. |
| 词 | The · boy · went |
| 标注 | the · boy · go.PST |
| 词性 | DET · N · V |
| 直译 | 男孩 去了 |
| 译文 | 男孩走了 |

`went` 的注释格可以带柠绿洗底，表示这是未确认建议。回车后洗底消失。

## Elevation & Depth

几乎没有浮起。句子纸面靠白底和 1px 浅边从纸底上分开，阴影只用 1px 的青墨 6% 透明。菜单是唯一明显浮层：白底、1px `outline`、8px 圆角、轻阴影。不要玻璃拟态，不要大投影，不要叠三层卡片。

聚焦句用左侧 2px 青绿条，或整句边框换成 `primary`。不要同时又加阴影又加粗边。

## Shapes

圆角小。句子纸 10px，菜单和输入 8px，词格 4px。小点菜单是 3px 圆点竖排三点，不是横排省略号，不是图标按钮。选中项前面是一个青绿小点，未选是空心点。

## Components

### 词格

未编辑时是文字，不是输入框。点进格子才出现细底边的输入。词面用语言形式字体。注释里的语法标签（`PST`、`PL`）用同一字体，可用稍紧的字距，不要做成彩色药丸堆。

每个词的右侧有词菜单，三个竖点，对齐在该词列内。句子菜单在整句右侧，不和词菜单抢同一位置。

### 菜单

菜单是浮层列表，不是一排按钮。项与项 32px 高。分组用一条浅分割，不算一层容器边框。

词菜单里要能到达这些动作，且默认收在「关系」子菜单中，不铺在格子上：切分、合并、删除、链到词条、不连续成分、声调标签、替换、删除音段、异干。声调是菜单内的一个短输入，占位「声调标签」。不连续成分写成「不连续成分 · ge…en」这种一行，不打开画布。

行菜单：上移、下移、隐藏、添加行、为这一行指定工作语言。语言选项前用小点，当前语言为实心点。添加和删除行是整篇的，不是只改这一句。

### 建议与状态

同形建议只出现在空白词的注释格里，作为占位文字加柠绿洗底。不要自动写成已确认。多个义项时格子里不自动挑一条；用菜单让人选。

删除会带走语素或链接时，菜单文案写明条数，例如「删除，并将 2 条语素、1 条链接改挂到左边」。

### 声学条

聚焦句展开后，波形在上，频谱和音高可叠在同一句的时间宽度上。高度紧凑，约 72px。没有播放头编辑，没有层手柄。这是这一句的图，不是转写页的时间轴。

## Do's and Don'ts

做：

- 保持行间对齐。词和它的注释、词性在同一列。
- 把切分、链接、关系、换行、换语言放进菜单。
- 三个竖点：句子和词的在内容右侧；行名的紧跟行名，默认隐藏。
- 原文不分词；词在全部原文之下；直译和译文是整句。
- 用纸面、青绿、青墨。柠绿只标记「还没确认」。

不做：

- 不要自由节点连线，不要依存树，不要共指弧。
- 不要把每个词的注释、词性、语素做成常驻输入框网格。
- 不要字体缩放控件。
- 不要第三层边框。
- 不要把波形做成可拖边界的时间轴。
- 不要玻璃、渐变英雄区、大圆角卡片、装饰插画。
- 不要把英文界面稿直接当最终文案。行名用上面列出的中文。
