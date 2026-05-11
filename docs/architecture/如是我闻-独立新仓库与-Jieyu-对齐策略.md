---
title: 如是我闻独立新仓库与 Jieyu 对齐策略
doc_type: architecture
status: active
owner: product-planning
last_reviewed: 2026-05-11
source_of_truth: cross-repo-handoff
---

# 如是我闻独立新仓库与 Jieyu 对齐策略

## 1. 目的与读者

本文定义 **如是我闻** 在 **独立新 Git 仓库** 中落地时，如何 **尽可能借鉴 Jieyu 的规范与成熟切片**，并 **系统性规避 Jieyu 已知的结构性缺陷与历史折衷**。

读者：如是我闻仓库的创建者、架构评审、与 Jieyu 侧对接的维护者。

执行计划真源（产品范围与阶段）：[`docs/execution/plans/如是我闻-本地版改进计划书-2026-05-11.md`](../execution/plans/如是我闻-本地版改进计划书-2026-05-11.md)。

**实践摆放（示例）**：产品独立仓 **Rushi** 可与 Jieyu **同父目录平级** 创建（例如 `…/（50）开发/Jieyu` 与 `…/（50）开发/Rushi`），便于 README 内用相对路径互链；见 Rushi 仓根目录 `README.md`。

## 2. 独立仓库的硬边界

1. **物理隔离**：如是我闻代码、CI、依赖锁文件与 Jieyu **分仓**；不通过「在 Jieyu 里开子目录」冒充独立产品。
2. **依赖隔离**：默认 **禁止** `workspace:*` 或 git submodule 直接依赖 Jieyu 应用源码树；若日后需要共享，仅允许 **独立发布的 npm 包** 或 **经评审的 types-only 子模块**，并 semver 管理。
3. **契约先行**：在如是我闻仓内维护 [`TranscriptionProvider` 等契约](../execution/plans/如是我闻-本地版改进计划书-2026-05-11.md)（见该计划 §6.1），以本仓为真源；Jieyu 仅作 **参考实现**，不是编译期依赖。

## 3. 规范包：建议在新仓库复刻或等效实现

下列文件在 Jieyu 根目录，可直接作为新仓 **CONTRIBUTING / AGENT 指令** 的母版，**裁剪** 与如是我闻无关的条目（协作云、多宿主翻译等），并写明「节选来源：Jieyu commit …」。

| 内容 | Jieyu 位置 | 如是我闻侧动作 |
|------|------------|----------------|
| 通用代理纪律 | [`AGENTS.md`](../../AGENTS.md) | 复制为 `AGENTS.md` 或合并进单一 `AGENTS.md`，删除不适用段 |
| 工程硬约束（编排层、控制器、复杂度、面板 CSS 等） | [`copilot-instructions.md`](../../copilot-instructions.md) | **必读节选**；目录规则中 `src/pages/use*Controller` 可改为如是我闻实际目录，但 **纪律等价** |
| 文档放置 | [`.cursor/rules/jieyu-docs-governance.mdc`](../../.cursor/rules/jieyu-docs-governance.mdc) | 采用 **同构** `docs/architecture/`、`docs/adr/`、`docs/execution/plans/`；仓库名不同则把「Jieyu」字样改为本产品 |
| 浏览器与 CSS 策略（若做桌面内嵌 WebView） | [`docs/architecture/桌面端浏览器支持策略.md`](./桌面端浏览器支持策略.md)、[`docs/architecture/CSS浏览器兼容矩阵.md`](./CSS浏览器兼容矩阵.md) | 视目标平台 **节选** |

## 4. 代码与思路白名单（可从 Jieyu 对照、按需手抄）

**手抄**时建议在文件头保留：`// Pattern derived from Jieyu <git-sha> <path>`；并遵守 Jieyu 开源许可证（根目录 [`LICENSE`](../../LICENSE) 为 **ISC**，复制片段需保留版权声明与许可全文惯例）。

| 主题 | 参考入口（Jieyu） | 借鉴要点 |
|------|-------------------|----------|
| STT 注册与多 Provider | [`src/services/stt/index.ts`](../../src/services/stt/index.ts) | registry、`isAvailable` 探测 |
| 本地 HTTP STT | [`src/services/stt/LocalWhisperSttProvider.ts`](../../src/services/stt/LocalWhisperSttProvider.ts) | baseUrl、错误语义、与 UI 解耦 |
| 增强步骤解耦 | [`src/services/stt/enhancementRegistry.ts`](../../src/services/stt/enhancementRegistry.ts) | ASR 与对齐/说话人后置 |
| VAD 参数化思路 | [`src/services/VadService.ts`](../../src/services/VadService.ts) | 分段、padding、阈值（正式产品可换 Python 侧 Silero/FunASR VAD） |
| 导出与多格式 | [`src/pages/transcriptionExportCallbacks.ts`](../../src/pages/transcriptionExportCallbacks.ts)、[`src/services/TextGridService.ts`](../../src/services/TextGridService.ts)、[`src/services/EafService.ts`](../../src/services/EafService.ts) | **内部统一模型 → 序列化**；勿让导出反噬编辑模型 |
| 项目包与版本 | [`src/services/JymService.ts`](../../src/services/JymService.ts) | 幂等导入、版本字段、可追溯 |

**不必借鉴**：转写页 ReadyWorkspace 巨型装配、协作云、多宿主翻译、AI Chat 全链——除非如是我闻产品范围明确纳入（当前计划书未纳入）。

## 5. 禁止清单：Jieyu 已知问题在新仓一律不当默认

| 反模式 | 说明 | 新仓对策 |
|--------|------|----------|
| **`data` 壳层误接** | 波形 / 时间轴 / 段落读模型 **不得** 从 `useTranscriptionData` 的 `data` 上「顺手」取 | 读并内化 [`ReadyWorkspace-数据域与壳层装配边界.md`](./ReadyWorkspace-数据域与壳层装配边界.md)；如是我闻若存在类似分层，**写 ADR + 自定义守卫或类型拆分**，禁止混源 |
| **编排层堆业务** | 页面 / Orchestrator 堆持久化、长异步、成簇 split/merge | 遵守 `copilot-instructions.md`：**controller / service / 纯函数** 下沉；为如是我闻设 `use*Controller` 或等价目录约定 |
| **mega-hook** | 单 hook 超线、effect 成堆 | 沿用 Jieyu **阈值与拆分纪律**；新仓 CI 从第一天启用 **复杂度或自定义 ratchet** |
| **无门禁的文档链接** | `check:docs-governance` 坏链累积 | 新仓 CI **必跑**文档链接检查（可自写轻量脚本，不必照搬 Jieyu 全量） |
| **默认捆绑重依赖** | LLM、多租户、云同步过早 | 对齐计划书：**P0–P3 不默认 LLM**；云仅 `TranscriptionProvider` 扩展位 |

## 6. 新仓库初始化清单（建议顺序）

1. **许可证与治理**：选择如是我闻许可证；若混合使用自 Jieyu 抄改的 ISC 片段，保留 ISC 义务；第三方（FFmpeg、模型、ONNX）单列清单（见计划书 §10.7）。
2. **AGENTS + 工程约束**：从 §3 母版生成首版 `AGENTS.md` + `copilot-instructions.md`（或合并为单一中文约束文件 + 英文 AGENTS 指针）。
3. **最小 CI**：`typecheck`、`unit test`、**docs 链接**、**ESLint 关键规则**；能搬则再加 **架构关键字审计**（不必一次等同 Jieyu 全部门禁）。
4. **首条 ADR**：记录「为何独立仓」「数据默认 SQLite」「ASR 为何独立 Python 进程」。
5. **同步节奏**：每迭代末对照 Jieyu **仅更新白名单/禁止清单**（本文档或如是我闻 `docs/architecture/与-Jieyu-差异登记.md`），避免无意识复制债务代码。

## 7. 与 Jieyu 仓库的协作方式

- **需求 / 缺陷**：如是我闻侧问题默认在 **如是我闻仓** 开 Issue；若根因是应从 Jieyu 抽取的共用库，再单开 Jieyu 侧「抽取 / 文档化」任务。
- **双向学习**：Jieyu 修复的 ReadyWorkspace 类事故、门禁新增规则——如是我闻侧 **只更新禁止项与 ADR**，不自动 cherry-pick 业务代码。

## 8. 修订

本文随如是我闻里程碑或 Jieyu 重大纪律变更更新；修订时更新 YAML `last_reviewed` 与正文版本说明。
