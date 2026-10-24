---
title: ui-ux-modernization design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-10-24
source_of_truth: ui-ux-modernization-spec
depends_on:
  - ./requirements.md
---

# Design — UI/UX修正与视觉迁移

## 1. 成熟方案扫描 / Research

- 仓库复用：`PanelButton`、`FormField`、`ModalPanel`、`PanelFeedback`；主题用`tokens.css`/`theme.ts`；布局按现有CSS owner。
- 标杆：[Carbon空状态](https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states)按任务原因给下一步，不把失败显示成无数据。
- 规范：[APG模态](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)规定模态焦点；[WCAG焦点](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)核对遮挡条件；[目标尺寸](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)核对24px或间距等例外。
- 反模式：只换全局色掩盖状态错误；复制整套新工作区；把所有面板模态化；卡片嵌套；设计稿虚构API和业务状态。
- 风险：窗口遮挡未必是标准违规；200%缩放不同于应用字体倍率；旧主题、异步保存/项目切换、IME和RTL易回归。
- 决定：**复用+适配**现有系统；先证实修正再上外观，无新UI依赖，无包体/许可/维护增量。
- 展开侧栏修复：按 [React 外部订阅](https://react.dev/reference/react/useSyncExternalStore)分离标题与内容订阅，固定 snapshot 身份直至内容变更，避免内容变化重绘整个壳层；按 [APG Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)补竖向标签焦点与关联。沿用已有滚动容器，禁止用多层卡片掩盖收缩和空态问题。
- 转写组合修复：复用`useFocusTrap`与DialogShell的containerRef；输入法和已消费事件优先于浮窗快捷键。声学检查器可收缩、正文滚动，时间轴保留最小操作区；网格行使用minmax(0,1fr)防止内容最小尺寸撑出视口。对读原文读取子段自己的内容，不借用共享父句文本。

## 2. 架构选择

- `state`：仅必要的既有显示/收起/主题状态；不为视觉复制业务状态。
- `derived`：从真实项目/层/选择/保存状态派生标签与可用性。
- `effect`：焦点、尺寸和已存在的偏好持久化；异步业务继续由现有controller/service处理。
- `actions/routing`：继续走现有创建/编辑/导入导出/选择分发；修正前追全部调用方与读写链。
- 取舍：一次一个可验收工作面，先旧外观修正再迁移；不上新组件库、不重写页面架构。

## 3. 落位与边界

| 文件/目录 | 责任 | 复杂度要求 |
|---|---|---|
| `src/styles/tokens.css`、`src/utils/theme.ts` | 新外观与现有明暗/偏好对接 | 不增加并行主题管理器 |
| `src/App.tsx`、`src/pages/TranscriptionPage.ReadyWorkspaceLayout.tsx` | flag与显示装配 | 只接线，遵循hotspot门槛 |
| `src/components/ui/`、`styles/foundation/` | 真实控件状态与原子样式 | 复用接口，不新增单用抽象 |
| `src/styles/pages/`、`src/styles/panels/` | 页面/面板owner规则 | 不跨层定义根控件 |
| `LayerActionPopoverCreateContent.tsx`、`src/i18n/` | 依层类型显示说明、产品文案 | 只改相关条件与键 |
| `src/hooks/ui/useRecoveryBanner.ts`及实际检查/应用入口 | 待复现后确定根因修正 | 单hook≤300行、≤12组合hooks |
| 各Workspace和现有controller | 其模块切片的视觉与已确认修正 | 只沿计划范围改动 |

- 时间轴读`TimelineUnitViewIndex`，写入经`timelineUnitMutationDispatch`；波形和UI state不得从文档data取。
- 容器最多两层边框；IGT/列表详情使用平面行、背景与间距。
- 不预建controller/service；若实修需要新模块或改变ADR语义，先更新该切片设计再实施。

## 4. ADR与排期

- 遵循ADR-0063/0064桌面交付与冻结、ADR-0048存储接口、ADR-0047桌面剔除协作。
- 默认不新增ADR：本轮不改存储/协议/产品能力。若实际交互需改变已接受决定，单独提案。
- #275/#325的实际状态在G0核对；文档日期不能替代当前代码与桌面证据。

## 5. Flag与主题

- 拟注册`modernWorkspaceUiEnabled`，默认false；沿现有注册表读取，不另造localStorage开关。
- 布局flag与配色各司其职；新主题若需ThemeId，由`theme.ts`注册并受试运行入口控制，保留旧偏好。
- 样式按新外观作用域启用；关闭flag不误留新布局或全局覆盖。行为bug修复不受flag隐藏。
- 试运行≥1周后启默认，稳定1个release cycle后清理分支。

## 6. 失败与回滚

- 暗色/字体/窗口组合未通过不标可用；没有桌面真实项目读回不得宣称交付完成。
- 回滚关flag或回退单个视觉提交；不改数据格式、不撤销安全与防丢数据修复。
- 新旧UI共用数据与handler；取消/失败保留输入，异步完成不得更新错误项目。

## 7. 验证

| 类型 | 命令/方法 | 通过条件 |
|---|---|---|
| 类型/定向行为 | `npm run typecheck`；`npx vitest run src/components/LayerActionPopover.test.tsx src/hooks/ui/useRecoveryBanner.test.tsx src/components/transcription/WaveformLeftStatusStrip.test.tsx` | 命中改动域并新增必要真实回归 |
| 布局/交互 | `npm run test:e2e:chromium` | #329前门槛；定向运行后阶段全量 |
| CSS/装配 | `npm run check:css-architecture`；`npm run check:panel-foundation` | 无新增违规 |
| 文档/工作流 | `npm run check:docs-governance`；`npm run check:dev-agent-workflow-verify` | 无新增违规 |
| 视觉/人工 | 实施计划G5全部矩阵 | 截图+任务结果+桌面真实读回 |

测试命令是后续实施要求，本次未执行产品测试；本次只运行文档检查。
