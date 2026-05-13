---
title: 解语 Copilot 项目级开发约束（canonical full text）
doc_type: agent-instructions
status: active
owner: repo
last_reviewed: 2026-05-13
applies_to: ["cursor", "github-copilot", "kimi-cli"]
---

# 解语 (Jieyu) — Copilot 项目级开发约束

## 权威范围与单一事实来源

- **本文件**是解语仓库内 **项目级工程约束**（编排层与 controller 边界、目录落位、复杂度阈值、`check:architecture-guard`、面板 CSS 双层边框规则等）的 **唯一完整正文**；在本仓库工作时，AI 工具应 **通读并遵守** 本文，不得以仅读过摘要替代。
- **通用代理基线**（Karpathy 风格：Think / Simplicity / Surgical / Goal-Driven，及代码审查数据流要求）以根目录 **`AGENTS.md`** 为唯一权威；Cursor / GitHub Copilot / Kimi-cli 三工具均原生自动加载。本文与 `AGENTS.md` 互补：`AGENTS.md` 是跨工具简短基线，本文是 Jieyu 项目级详细约束。
- **若摘要与本文不一致**，以本文为准；更新项目级约束时只改本文正文，并同步检查 `AGENTS.md` 中的交叉引用是否仍正确。
- **UI 文案与 AI 内部 formatter 文案分层**：用户可见字符串走 `dictKeys` / `src/i18n`；面向模型/工具输出的固定句式放在 **`src/ai/messages/`**（如 `structuredAnswerCopy.ts`），勿与界面字典混在同一命名空间。

本文件用于约束在本仓库中运行的 AI 编码代理（GitHub Copilot、Cursor、Kimi-cli）。

## 0. 高优先级硬规则（启动即生效）

### 0.1 通用代理基线指针

> **Karpathy 4 rules（Think / Simplicity / Surgical / Goal-Driven）与代码审查硬规则**：见 [AGENTS.md](AGENTS.md) §1–4，本文不重复。
> **新任务工作流（Explore → Plan → Implement → Commit）**：见本文 §五 详细展开；[AGENTS.md](AGENTS.md) 有简短引用。

### 0.2 Jieyu 项目级硬规则（每次任务默认启用）

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

## 五、新任务的默认工作流（Explore → Plan → Implement → Commit）

中等及以上复杂度任务必须按四阶段推进；小修复（单文件 ≤ 10 行）可跳过 Explore 但 Commit 阶段的验证证据不可省。

### 5.1 Explore（仅读不改）

**目标**：在动手前对齐"我知道什么 / 我假设什么 / 我不知道什么"。

**只读资源**：
- `src/`（仅扫读，不改）
- [docs/architecture/](docs/architecture/)、[docs/adr/](docs/adr/)
- 相关 [docs/execution/specs/](docs/execution/specs/)（如有）
- 既存模式锚点见上文 §四

**三工具对应模式**：
- Cursor：Plan / Ask mode；可委托 `Task` subagent_type=`explore` 做广搜
- Kimi-cli：`--explore` 模式或主 agent + grep tool
- GitHub Copilot：主 chat 用 codebase search / ask 模式（无独立 readonly 子 agent）

**产出**：一份 ≤ 20 行的"已读事实"清单，至少含：
1. 受影响的页面 / controller / service 列表
2. 既有最相似的模式参考
3. 与本次改动冲突的硬约束（编排层 / ReadyWorkspace / 双层边框 / hotspot ratchet 等）
4. 已确认的假设 vs 待澄清问题

### 5.2 Plan（产出落位 + 验证方式，等用户确认）

**目标**：把"做什么"落到具体文件 + 具体验证命令，等用户拍板后才进入 Implement。

**Plan 必含字段**：
1. 成熟方案扫描结论：复用 / 适配 / 自研，以及理由
2. 新增逻辑类别归属：`state / derived / effect / actions / routing`
3. 落位文件清单：`src/pages/useXxxController.ts`、`src/services/XxxService.ts`、`src/hooks/...` 等具体路径
4. 拆分边界：哪些进 controller、哪些进 service、UI 保留哪些
5. 验证方式：具体 `npm run` / `vitest` / E2E 命令
6. 触发 SDD？（见 §5.2.1 触发条件）；触发则同时在 [docs/execution/specs/<slug>/](docs/execution/specs/) 起草三件套

#### 5.2.1 SDD 三件套触发条件（中等及以上复杂度）

满足任一即触发 [docs/execution/specs/<feature-slug>/](docs/execution/specs/) 三件套（`requirements.md` / `design.md` / `tasks.md`，模板见 [docs/execution/specs/_template/](docs/execution/specs/_template/)）：

- ≥ 1 新 controller hook
- ≥ 1 新 service 模块
- 跨 ≥ 3 个 controller 的改动
- 触及 ReadyWorkspace 装配 / 时间轴单 host 入口
- 触及持久化 schema / 迁移
- 新增 feature flag

未触发的中等改动允许直接以 Plan 文本说明（不强制建 specs/ 目录）。

### 5.3 Implement（执行 Plan，逐步验证）

- 严格按 Plan 中的落位文件清单执行；不顺手"改进"无关代码（Surgical Changes）。
- 每完成一个落位文件就跑相关 `typecheck` / 定向 `vitest`，**不要憋到最后**。
- 涉及 `src/ai/**` 改动时跑 `npm run check:agent-evals:smoke`。
- 触及编排 / 复杂度时跑 `npm run check:architecture-guard`。
- 高风险或 UI 觉察大改默认套 feature flag（`src/ai/config/featureFlags.ts`），`false` 合并，自用 1 周后切默认 `true`；详见 §五.5 feature flag 工作流。

#### 5.3.1 Agent evals 分层（L1 pre-merge 接线）

`npm run check:agent-evals` 分两档：

- `check:agent-evals:smoke`（≤ ~90s，3 个核心 case，覆盖典型 AI 失误）：
  - `typecheck` — 错读路径 / 错引模块导致编译失败
  - `architecture-guard-core` — 业务逻辑落到编排层、复杂度上限
  - `ai-messages-isolation` — UI 文案落到 `src/ai/messages/`（formatter 文案与 i18n 分层）
- `check:agent-evals:full`（完整 16 case）— 触及 `src/ai/**` 的改动必跑。

**接线**：smoke 接 L1 pre-merge（与拍板 2A 一致）；非 `src/ai/**` 改动只跑 smoke 即可，full 仅在 AI 改动或 release 前跑。

#### 5.3.2 Prod-failure → eval case 反哺惯例

每个 AI 引入的产线 bug（包括"明明 typecheck 过了却线上炸"、"明明 lint 过了却行为错"等）必须遵守：

1. **先补 1 个 eval case** 让该失误下次能被自动捕获：
   - 简单失误 → `scripts/agent-evals/suite.v1.json` 加 case（tiers 至少含 `full`，理想含 `smoke`）。
   - 复杂失误 → 加专门 vitest / E2E case，再在 suite 里 reference 它。
2. **再修 bug**。
3. PR 描述里链 eval case ID + bug 现象，便于追溯。
4. 不允许"先修了再说"——eval case 是防止同类失误的唯一可靠手段。

### 5.4 Commit（commit msg 附验证证据）

**目标**：让审阅者（即使是未来的自己）能从 commit msg 一眼看到"做了什么 + 验证过什么"。

**Commit msg 必含**：
1. 标题：祈使句 ≤ 72 字
2. 正文：改动动机（"为什么"，而不仅是"什么"）
3. 验证证据：实际跑过的命令 + 关键结果摘要，例如：
   ```
   Verified:
   - npm run typecheck → 0 errors
   - npx vitest run src/hooks/transcription → 142 passed
   - npm run check:architecture-guard → OK
   ```

**禁止**：未跑实际命令就在 commit msg 写 "verified" / "tested"。

### 5.5 Feature flag 工作流（§一.B 拍板，半年内对外）

- 高风险或 UI 觉察大改：在 [src/ai/config/featureFlags.ts](src/ai/config/featureFlags.ts) 注册 `boolean | enum` flag（已是项目唯一 flag 注册表，AI 与非 AI 共用）。
- 默认 `false` 合并 → 自用至少 1 周 → 切默认 `true`。
- Flag 来源：`localStorage`（运行时切换） + `import.meta.env`（构建时默认）。
- Flag 收口：稳定 1 个 release cycle 后**清理 flag** 与所有分支，不留长期 dead 分支。

### 5.6 默认工作流（小任务跳过 Explore）

对于小修复或单点抽离（单文件 ≤ 10 行，无新落位文件）：
1. 跳过 Explore（但仍需说明假设）。
2. Plan 可压缩到 1–2 句（改哪个文件 + 验证命令）。
3. Implement 同上。
4. Commit 验证证据**不可省**。

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