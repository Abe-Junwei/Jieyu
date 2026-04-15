# 解语 (Jieyu) — Copilot 项目级开发约束

本文件用于约束在本仓库中运行的 AI 编码代理（如 GitHub Copilot）。

## 0. 高优先级硬规则（启动即生效）

### 0.1 Karpathy 风格常驻执行约束（每次任务默认启用）

以下行为规则来自 `forrestchang/andrej-karpathy-skills`，在本仓库中视为所有非琐碎任务的默认执行契约：

1. Think Before Coding：先澄清假设，不要静默猜测；有歧义时先说明再实现。
2. Simplicity First：只写完成目标所需的最小代码，不做额外抽象、配置化或教程式扩展。
3. Surgical Changes：只改与当前需求直接相关的代码；不顺手重构、不改无关注释与格式。
4. Goal-Driven Execution：先定义可验证目标，再通过 typecheck / test / build / UI 复验形成闭环。

默认执行要求：

- 非 trivial 任务先给出简短步骤与验证方式，再动手实现。
- 修 bug / 做重构时，优先补最小复现或聚焦验证，再提交修复。
- 未经实际验证，不得宣称“已完成”或“已修复”。
- 若存在多种方案，优先选择“改动更小、证据更强、风格更贴近现有代码”的方案。

以下规则优先级最高；若与后文的展开说明重复，以本节作为快速执行版本：

1. 编排层强制分离，不是 Hook 强制分离。
页面、Orchestrator、复杂组件只负责组装、透传、事件绑定；重业务逻辑必须下沉。

2. 不要把所有复杂逻辑机械抽成 custom hook。
下沉目标按职责选择：纯函数 / service / controller hook / shared hook。

3. 页面或 Orchestrator 中，禁止继续累积成簇业务回调。
凡是 create / mutate / delete / split / merge / routing / speaker / batch / waveform 这类同类回调成组出现时，优先提取 dedicated controller。

4. 允许留在组件内的只有：纯渲染、简单事件绑定、轻量 UI 状态、严格 UI-only effect。
数据库写入、异步流程、跨状态协调、重派生计算，不允许继续留在页面层。

5. 单个 hook 超过 300 行，或 `useEffect/useMemo/useCallback` 总数超过 12 个时，必须拆分。

6. 本仓库遵守现有目录结构，不引入外部教程式 `src/features/...` 体系。
页面专属 controller 放在 `src/pages/useXxxController.ts`；通用 hook 在 `src/hooks/`；领域写路径在 `src/services/`。

7. 中等及以上复杂度任务，默认先定落位文件，再写代码。
优先顺序：先 controller/service，后 UI 接线。

8. 任何结构性拆分，默认必须补：focused tests、结构守卫、必要文档、类型检查与相关回归验证。

9. 禁止制造“薄 hook”或“mega-hook 平移”。
拆分的目标是减少复杂度，不是转移复杂度。

10. 若 `check:architecture-guard` 已出现 hotspot warning（接近上限），同一任务默认优先处理拆分或给出显式例外，不允许继续在该文件上无上限叠加功能。
11. **面板 CSS 最多 2 层可见容器边框**。从外壳到最内层内容，同一视觉路径上最多只允许 2 层带 `border` 的容器嵌套（如 Shell → 区域面板）。第 3 层及更深层级的容器**禁止**再添加 `border`，必须改用背景色差异（`background` / `color-mix`）或间距（`gap` / `padding`）来区分层级。此规则适用于所有语言资产面板及未来新增的面板 CSS。
目标不是“把所有逻辑都塞进 custom hook”，而是强制执行：

1. 编排层只做组装，不承载重业务逻辑。
2. 复杂逻辑必须从页面或组件中下沉。
3. 下沉目标按职责选择：纯函数 / service / controller hook / shared hook。

## 一、核心原则

### 1. 编排层强制分离，不是 Hook 强制分离

对于 React 页面、Orchestrator、复杂组件：

- 允许保留：
  - 纯渲染逻辑
  - 简单事件绑定
  - 轻量 UI 状态
  - 严格 UI-only effect（例如 focus、尺寸同步、纯展示层 localStorage）
- 不允许保留：
  - 持久化写操作
  - 异步业务流程编排
  - 跨多组状态的协调逻辑
  - 较重的派生计算
  - 成簇的 split / merge / delete / create / routing 业务回调

这些逻辑必须下沉，但下沉目标不局限于 custom hook。

### 2. 按职责选择下沉目标

优先使用最合适的抽象，而不是默认一律抽 hook：

- 纯函数：适合无 React 依赖的计算、映射、格式化、规则判断。
- service：适合数据库、存储、外部接口、任务执行、领域写操作。
- controller hook：适合页面级状态协调、回调路由、局部编排。
- shared hook：适合跨页面复用的通用 React 行为。

禁止出现“只是为了满足拆分要求而新建的薄 hook”。

## 二、复杂度阈值

沿用仓库现有纪律，并将其视为强约束：

1. 单个 hook 超过 300 行时，必须拆分。
2. 单个 hook 中 `useEffect/useMemo/useCallback` 总数超过 12 个时，必须拆分。
3. 页面或 Orchestrator 中若出现一组同类业务回调（例如 create/mutate/router/speaker/batch/waveform），必须优先考虑提取 dedicated controller。
4. 若新增逻辑会让页面层继续膨胀，应优先视为“架构未完成”，而不是“功能已完成”。
5. 若文件进入 architecture hotspot 区（默认达到硬上限的 85%），应在同一 PR 内优先拆分、降复杂度，或明确登记为暂时例外并给出回收计划。

## 三、目录与落位规则

本仓库不使用通用 `src/features/...` 约定。必须遵守当前真实结构：

- 页面专属 controller：`src/pages/useXxxController.ts`
- 通用 hook：`src/hooks/useXxx.ts`
- 领域服务与持久化写路径：`src/services/XxxService.ts`
- 纯工具函数：`src/utils/` 或页面侧 `Xxx.helpers.ts`
- UI 组件：`src/components/` 或页面对应 section/component 文件

### 页面逻辑的推荐拆分方式

对于类似 `TranscriptionPage.Orchestrator.tsx` 的大页面，优先按职责切刀：

1. creation controller
2. mutation controller
3. interaction controller
4. runtime props/controller
5. speaker/batch/media/project lifecycle controller

## 四、现有代码风格优先级

AI 生成代码时，必须优先模仿仓库中的真实范式，而不是套用外部教程结构。

当前优先参考的真实模式包括：

- `src/pages/useTranscriptionSegmentCreationController.ts`
- `src/pages/useTranscriptionSegmentMutationController.ts`
- `src/pages/useTranscriptionTimelineInteractionController.ts`
- `src/pages/useSpeakerActionRoutingController.ts`
- `src/pages/useBatchOperationController.ts`

如果新逻辑和上述模式相似，优先延续这些边界，而不是重新发明目录结构。

## 五、新任务的默认工作流

当实现中等及以上复杂度需求时，必须遵循：

1. 先判断新增逻辑属于 `state / derived / effect / actions / routing` 哪一类。
2. 先确定落位文件，再开始实现。
3. 若涉及页面级复杂逻辑，优先先写 controller，再接回 UI。
4. UI 文件最后只保留组装、透传和事件绑定。

对于小修复或单点抽离，可以直接实现，但仍必须遵守“编排层不承载重逻辑”。

## 六、禁止模式

禁止以下模式在本仓库中继续扩散：

1. 直接在页面组件中写数据库或 service 编排细节。
2. 在 Orchestrator 中继续累积新的成簇业务回调。
3. 把大块业务逻辑包进一个新的 mega-hook，只是把问题从组件平移到 hook。
4. 因为“想复用”就过早抽象，导致边界更模糊。
5. 引入与当前仓库不一致的目录体系（如强行切到 `src/features/...`）。

## 七、拆分后的必做项

任何结构性拆分完成后，默认应同步完成：

1. focused tests
2. 结构守卫或结构测试更新
3. 必要文档更新
4. 类型检查与相关回归验证

如果用户没有明确排除测试或文档，代理应默认补齐这些项。

## 八、提交前自检

在结束任务前，代理应自问：

1. 新增业务逻辑是否还留在页面编排层？
2. 下沉目标是否选对了，而不是机械抽成 hook？
3. 是否触发了 300 行 / 12 hooks 阈值？
4. 是否补了 focused tests、结构守卫、文档？
5. 这次改动是在减少未来复杂度，还是只是转移复杂度？

如果答案不理想，应继续重构，而不是直接停止。

## 九、面板 CSS 视觉层级规则

### 最多 2 层可见容器（Two-Layer Visible Container Rule）

面板从外到内的视觉嵌套中，**同一路径上最多只允许 2 层带显式 `border` 的容器**：

- **第 1 层**：面板外壳（Shell），如 `.la-shell`、`.dialog-card`
- **第 2 层**：区域面板（Region Panel），如 `.ob-list-panel`、`.ob-bridge-panel`、`.om-browser`、`.lm-history-panel`
- **第 3 层及以下**：禁止使用 `border`，必须用以下替代手段区分层级：
  - 背景色差异（`background` + `color-mix` 调整明度/饱和度）
  - 间距（`gap`、`padding`）
  - 圆角（`border-radius`）配合背景色
  - 状态边框除外：交互态（如 `active`、`focus-visible`、`error`）可临时显现边框

### 适用范围

- 所有 `language-asset-section-contract.css` 合约层样式
- 所有 `language-metadata-workspace.css`、`orthography-bridge-workspace.css`、`orthography-manager-panel.css` 页面样式
- 未来新增的任何面板 CSS

### 判断方法

新增带 `border` 的容器前，沿 DOM 路径向上数已有显式 `border` 的祖先容器数量。若已有 ≥ 2 层，则当前容器不得再加 `border`。

### 例外

- 语义性边框：`<hr>`、分割线（`border-top` 作为逻辑分隔线）不计入容器层数
- 交互反馈边框：`:focus-visible`、`:active`、`-active`、`-error` 等状态可临时显现
- 表单控件原生边框（`<input>`、`<select>`、`<textarea>`）不计入容器层数