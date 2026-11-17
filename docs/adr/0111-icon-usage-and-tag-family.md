---
title: ADR 0111 - 设计系统图标用法与标签家族
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0103-paper-field-notes-is-the-only-appearance.md
  - ./0106-design-system-package-lives-in-repo.md
  - ./0108-control-border-contrast-3-to-1.md
  - ./0109-design-system-no-info-blue-noto-ipa-and-menu-target.md
---

# ADR 0111：设计系统图标用法与标签家族

## 背景

`DESIGN.md` 只用一句话规定了「图标用 Lucide、默认 20px、伴随文字 16px」。设计系统包 `design/jieyu-paper/` 里没有图标页，各预览页一部分手抄 Lucide 路径，一部分用 Unicode 字符（▾ ▸ ⋯ × ＋ ▲▼ ⋮⋮ ↑ ›）充当控件；左轨示意是四段文字，而产品左轨早已是 Lucide 图标。产品侧 `src/styles/foundation/jieyu-icon.css` 有 17 个尺寸变量、11 种取值（11–28px），左轨 24px，线宽 1.5 且选中时加粗；设置里另有「图标效果」开关（悬停缩放、加粗描边），并留着一套未接入的左轨 Lottie 动画资源。

标签类元素散在四页，写法互相矛盾：表单页 chip 是白底加 1px 边，输入页标签是浅灰底无边，反馈页状态片又是一套；「待复核」在 `app.html` 用靛青文字，与「靛青只作次要标记」相悖。没有任何规则说明计数、状态、分类、筛选、输入值各用哪种。

对照的成熟做法：Material 3 把 chip 分为 assist / filter / input / suggestion，筛选 chip 选中时加勾；IBM Carbon 把 tag 分为只读、可移除、可选择、可操作，只读 tag 是填充底、可交互的带边。两者都把「能不能点」放在外观上区分，把颜色从分类含义中拿掉或限制在少数语义上。

## 决定

1. **图标只有两档：20px（左轨、空状态、拖放区）和 16px（按钮、伴随文字、控件内记号），线宽 1.75，颜色跟随文字。** 产品侧现在一次收敛，按位置归档：左轨、导入大图标、语音主麦 20px，其余（含播放主钮、关闭、行内、极小记号）16px；`jieyu-icon--*` 类名保留，只表示位置。选中和悬停不再改线宽。
2. **图标只有静态一种。** 取消设置里的「图标效果」，删除 `iconEffect.ts`、`icon-effect-motion.css` 与左轨 Lottie 资源；已存的偏好值直接忽略。悬停与选中反馈只靠底色和墨色变化。
3. **图标只给没有文字也能认出的通用操作。** 用：工具栏常驻动作、控件里的通用记号（下拉、树展开、关闭、清除、移除、更多、拖动把手）、左轨导航、列表末尾的「添加」、空状态主图形。不用：状态（色点＋文字）、确定度 ✓ ≈ ? 与 IGT／IPA／说话人字母、带动词的文字按钮、菜单项、标签页、列表行。不用 Unicode 字符充当控件。
4. **设计系统包的图标从已安装的 `lucide-react` 生成。** `scripts/build-od-icon-sprite.mjs`（`npm run build:od-icons`）按清单生成 `preview/icons.js` sprite；`preview/icons.html` 登记每个图标的用途，同一个意思只对应一个图标。名称与产品 `JieyuIcon` 一致。
5. **标签是一个家族、五种用途：计数徽标、状态片、只读标签、筛选标签、输入标签。** 只读类（徽标、状态片、只读标签）用浅灰填充底，无边、无悬停；可交互类中，筛选标签用控件边（满足 [ADR-0108](./0108-control-border-contrast-3-to-1.md) 的 3:1），选中加勾；输入标签的移除命中扩到 24×24。不给分类配色；颜色只出现在状态片色点和错误／待处理徽标上。规则写入 `DESIGN.md` §5「标签与徽标」，样板为 `preview/components-tags.html`，各预览页共用 `preview.css` 中的同一套类。产品里的标签随各页面重设计逐页套用，暂不建公共组件。查询构建器的「并且 / 或者」是小下拉控件，不属于标签。
6. **两道机器守卫。** `npm run check:icon-sizes`（含于 `check:css-architecture`）只允许 `jieyu-icon.css` 设定图标尺寸与线宽，且取值只能是 16px / 20px / 1.75，`<JieyuIcon>` 不得传尺寸属性；`build-od-icon-sprite.mjs --check`（含于 `check:docs-governance`）在预览 sprite 与已装 `lucide-react` 不一致时失败。

## 未选方案

- **不建标签规则，由各页自定**：现状已经出现三套写法和一处语义色误用，重设计各页时只会继续分叉。
- **按词性、语义域给标签配色**：与 [ADR-0103](./0103-paper-field-notes-is-the-only-appearance.md) 的墨色体系冲突，分类一多颜色无法区分，也会和状态色混淆。
- **左轨用图标＋常驻文字**：52px 左轨放不下中文名称；名称放在悬停提示与读屏名里，与 DESIGN §5「导航缩写／图标可查看完整名称」一致。
- **保留「动效」图标模式**：与 [ADR-0103](./0103-paper-field-notes-is-the-only-appearance.md)「只有一套外观、设置只切换亮暗」冲突，也让线宽规则出现第二套取值。
- **产品尺寸随页面重设计逐页收敛**：散落的 17 个变量会在重设计前继续被新代码引用，一次收敛加守卫更便宜。
- **预览页继续手抄 SVG 路径**：路径会随 Lucide 升级漂移，也无法核对名称是否与产品一致。

## 影响

- 运行中的界面变化：左轨图标 24→20px，播放主钮 18→16px，导入大图标 28→20px，语音主麦 22→20px，其余 11–15px 的图标放大到 16px；线宽 1.5→1.75 且不再随选中加粗；设置里少一项「图标效果」。
- 运行中页面的标签样式在各切片重设计时按本 ADR 对齐。
- 新增预览图标须先在 `preview/icons.html` 登记用途，再改脚本清单并运行 `npm run build:od-icons`。
