---
title: ADR 0010 - 写作工作台导出运行时
doc_type: adr
status: proposed
owner: repo
last_reviewed: 2026-04-21
source_of_truth: decision-record
---

# ADR 0010：写作工作台导出运行时

## 背景

写作路线承诺 **docx / HTML / TeX**，并新增 **PDF**；PDF 的 **默认实现栈** 为 **Typst**（与 Pandoc 衔接的具体命令在实现 PR 冻结，典型形态为 **Pandoc → `.typ` → `typst compile` → `.pdf`**，或等价受控管线）。**四出** 中的 **TeX** 指 **`pandoc --to latex` 所生成的 `.tex` 源码**；**生成该文件不依赖** 本机安装 `pdflatex` / 完整 TeX Live——**绕开 LaTeX 作为运行时依赖**，详见路线图 **[2.3.1 · 绕开 LaTeX 运行态，仅导出 TeX 源码](../execution/plans/写作页开发路线图-2026-04-22.md#231-绕开-latex-运行态仅导出-tex-源码)**。**LaTeX / CTAN**（`expex`、`forest` 等）的 **完整可编译版式** 仍通过 **向用户交付 `.tex` + 用户侧或 Overleaf 编译** 满足；**Typst PDF 不承诺**与任意 LaTeX 模板 **像素级等价**。纯 Web 环境须在 **开发者/CI** 与 **零本地** 用户之间划分责任，并统一失败 UX。规划见 [写作页开发路线图 · 2.4 导出运行时](../execution/plans/写作页开发路线图-2026-04-22.md#24-导出运行时决策树须在-g0-收口g1-前成文) 与 [G0 定稿](../execution/plans/写作页导出运行时已采纳默认-G0-定稿-2026-04-22.md)。

上游变化：Pandoc 3.9 线提供 **`pandoc-wasm`**（npm / [pandoc/pandoc-wasm](https://github.com/pandoc/pandoc-wasm)）等 **浏览器内文本转换** 能力（**子集**、**能力 ⊂ CLI**）。**Typst** 提供 **原生 WASM 编译器**（[typst.app](https://typst.app/) 生态），使 **浏览器内受控 PDF** 成为 **C 档可选增强**（须单独体积与能力评审），**不**替代 **本机/CI 上 `typst` CLI** 的默认 golden。默认验收真源仍以 **本机/CI：Pandoc + Typst CLI + 锁版本模板/包版本** 为准。

## 预览与导出：单一 Pandoc 解析核（默认）

**目的**：消除「浏览器内 remark/rehype 一套 HTML、导出 Pandoc 另一套」的长期语义漂移。

1. **默认预览 HTML**：与 **docx/html/tex 导出** 使用 **同一 Pandoc 调用约定**（同一 `defaults` / 同一 Pandoc minor / 同一 Lua 白名单策略），在 **Web Worker** 中执行 **`pandoc --to html5`**（或等价受控入口，如锁定的 `pandoc-wasm` 子集），产出 **可 sandbox 的 HTML**；主线程仅负责 **debounce、进度、Blob/字符串与诊断**。
2. **非目标**：**不以** unified/remark/rehype 作为 **必须与导出像素级一致** 的权威预览管线；若仓库仍引入 remark 系依赖，**仅限** CM6 语法高亮、折叠、轻量 AST 辅助（块 `kind` 范围映射等），且须在 PR 中声明 **不得**替代上条 Pandoc 预览真值。
3. **Golden**：CI 除 **docx/html/tex** 与 **Typst PDF**（fixture → 非空 `.pdf` + 可选体积/页数断言）外，须有 **fixture md → Pandoc HTML** 的 **基线 diff**（与路线图第七节一致）；`typst`、`pandoc` **minor** 与入口脚本一并锁版本；版本 bump 先红灯再人工更新基线。
4. **安全**：HTML 预览须 **iframe sandbox** 或等价 CSP；**禁止**将未消毒的任意 HTML 直接 merge 进应用根 DOM。

## 纯 Web 下预览引擎与分档语义（消歧义）

1. **「同一 Pandoc 核」≠「同一二进制」**：指 **`defaults` / Lua 白名单 / Pandoc 版本族** 与导出 **对齐的配置与语义真源**；在 **纯 Web** 中，Worker 内 **可执行入口** 的 **现实载体** 为 **`pandoc-wasm`（或等价 WASM 封装）**，而非宿主 OS 上的 `pandoc` CLI 可执行文件。
2. **路线图「`pandoc-wasm` / Typst WASM 仅为 C 档观察或增强」** 约束的是 **对用户承诺的导出能力、golden 等价性与分档叙述**（见 [路线图 2.4](../execution/plans/写作页开发路线图-2026-04-22.md#24-导出运行时决策树须在-g0-收口g1-前成文) 与本 ADR **混合策略**），**不是**「禁止在预览 Worker 中使用 WASM」。**在浏览器里做权威 HTML 预览** 与 **「不向 C 档用户假装拥有 A 档 CLI golden」** 可同时成立。
3. **Typst WASM** 同理：可作为 **浏览器内** PDF 子集路径，**不得**与 **Typst CLI `typst compile` golden** 默认同义（见决策 3b）。

## HTML 预览触发策略（工程约束）

**背景**：Pandoc **非增量**；长文 **每键全量** `md → html5` 会放大 **TTFF** 与输入跟手风险（与 [路线图 2.7.4](../execution/plans/写作页开发路线图-2026-04-22.md#27-体验安全迁移与生态补充)、[2.8.3](../execution/plans/写作页开发路线图-2026-04-22.md#28-可访问性事故手册大文档边界与横向收口) 同轨）。

**默认采纳**：

1. **编辑态**：**CM6 / Lezer**（及允许的轻量 mdast）负责语法高亮、折叠、块范围；**不得**把「**每次按键**即对**整篇**文稿跑一轮全量 Pandoc HTML」作为默认实现。
2. **权威 HTML 预览**（Worker）：须 **debounce + 可取消**（实现 PR 写明 **最小间隔**、**最大排队深度**）；**推荐**提供 **显式「刷新预览」** 作为超时、失败或用户不信任自动刷新时的兜底。
3. **进阶优化（可选）**：在同一编辑会话中，可仅对 **变更区间所在章 / 滑动窗口** 提交预览任务；任何「整本上千页」策略 **须** 有 **上限或显式降级**（见 [路线图 2.8.3](../execution/plans/写作页开发路线图-2026-04-22.md#28-可访问性事故手册大文档边界与横向收口)）。

## 宿主与打包形态（导出能力边界）

| 形态 | 对 **四出 / CLI golden** 的含义 | 文档与 PR 义务 |
|------|--------------------------------|----------------|
| **纯 Web**（仅浏览器 Tab、无绑定 CLI） | 用户环境 **不保证** 可调起 Pandoc/Typst CLI；**A 档** 依赖用户自装或团队 devcontainer；**C 档** 以 zip、脚本与 [路线图 2.4](../execution/plans/写作页开发路线图-2026-04-22.md#24-导出运行时决策树须在-g0-收口g1-前成文) 为准。 | 产品文案、灰显与诊断 **与分档一致**；**禁止**暗示「纯浏览器 ≡ 无成本完整四出 golden」。 |
| **桌面壳（Electron / Tauri 等）** | **若且唯若** 安装包 **内置** 经审计的 **固定版本** Pandoc/Typst（或等价受控子进程），可在该产品形态下 **书面声明**「用户 **零手动** 安装 CLI 仍可得四出」——**须** 与本表、**[版本表](#版本表-单一工程真源)**、子进程安全（[路线图 2.7.3](../execution/plans/写作页开发路线图-2026-04-22.md#27-体验安全迁移与生态补充)）**同里程碑闭合**。 |
| **托管云端编译** | **非**本 ADR 默认承诺；若引入须 **superseding** 段落与合规评审。 | 见 **后续回顾点** 第 4 条。 |

## 官方一键环境（开发者 / CI）

**目的**：降低「本机没装 Pandoc」导致的假阴性验收与 onboarding 摩擦（路线图 G0.5 交付物）。

1. **默认叙述**：仓库提供 **文档化最短路径**——优先 **devcontainer** 或 **`scripts/` 下可重复 shell**（须含 **Pandoc + Typst CLI** 或与 CI 镜像一致的最小集合；具体路径在实现 PR 落地，并链回本节）；CI 镜像 **必须** 与 **[版本表](#版本表-单一工程真源)** 一致。
2. **非承诺**：一键环境 **不** 向终端用户替代 C 档 zip 回退；仅服务开发者、CI 与自愿本地对齐。

## 版本表（单一工程真源）

**规则**：下表为 **Pandoc / Typst / 模板与 filter 链** 的 **唯一文档真源**（SSOT）。CI job、`devcontainer`、`scripts/` 与 README **只引用本节** 或 **由本节生成的机器可读片段**（实现 PR 可增脚本从本节 YAML 打印版本）；**禁止**在多处手写 **不一致的 minor** 而不更新本节。

| 组件 | 锁定字段 | 填写状态 | 备注 |
|------|-----------|----------|------|
| Pandoc CLI | `pandoc --version` → major.minor | **待 G0.5 回填** | 须与 CI golden 镜像一致 |
| Typst CLI | `typst --version` | **待 G0.5 回填** | A 档 PDF golden |
| Typst `@preview/*`（若有） | 包名 + 版本串 | **待评估** | 与项目 `.typ` 入口一并锁 |
| Lua filters | 路径 + Git 指纹或版本标签 | **待回填** | 须在白名单内 |
| `defaults` / 模板 / `reference.docx` | 路径或子模块 commit | **待回填** | 与 docx/html/tex 同源 |

首次将 **CI 指纹** 写入仓库时，须在本表 **填写状态** 更新为 **已锁定** 并链到 **CI artifact 或 workflow 路径**。

## kind → Typst 映射基线（v0 stub）

**目的**：G1.5 **Typst PDF** 须有 **可评审默认**，避免各实现分叉。下表为 **v0**：未列出的 `kind` 在 **Typst PDF** 上默认 **占位 + 可诊断 warning**；**完整 CTAN / 语言学 LaTeX 真值** 仍以 **TeX 导出** 为准（见上文背景）。**合同包**中的映射索引须与本表 **同 PR 演进**（见 [路线图 2.5](../execution/plans/写作页开发路线图-2026-04-22.md#25-写作合同包全仓块语义单一正本)）。

| `kind`（合同包枚举） | Typst PDF v0 | TeX / 其他导出 | 备注 |
|----------------------|----------------|-----------------|------|
| `corpus-example` | 结构化 box（摘录 + ref 标签）；**不**承诺期刊级双栏 | Pandoc + 模板 | 与 [0011](./0011-writing-corpus-ref-and-citation-jump.md) Resolver 输出形状对齐 |
| `gloss` | 简化术语行或列表 | expex 等由模板 | Typst 为声明子集 |
| `syntax-tree` / `phylogeny` | **占位框** + 提示「见 TeX / HTML」 | 模板映射 | G3 前可收紧为 SVG |
| `vowel-chart` | **占位** 或预渲染静态图路径（若已有资产） | 模板 | 与 [路线图附录 D](../execution/plans/写作页开发路线图-2026-04-22.md#附录-d--图码供应链降级矩阵g3-前定案) 一致 |
| `table-data` | 简化 `table`；复杂表 **降级占位** | docx/tex 为主 |  |
| `diagram-engine` / `embed-whiteboard` | **占位**（G3 前） | 依 ADR 0015 |  |
| `raw-latex` | **见下节** | **完整 LaTeX 真值** | Typst 不内联编译任意 CTAN |
| 其他 / 未来 `kind` | 占位 + warning | 依 Pandoc | 增枚举时 **须** 更本表 |

**CI**：至少 **一个 fixture** 覆盖 **「结构化 `kind` + `raw-latex`」→ PDF** 的占位策略（与下节断言一致）。

## raw LaTeX 在 Typst PDF 路径上的降级（默认决策）

**用户可见**：当用户选择 **Typst PDF** 且文稿含 **`raw-latex` 块** 时，**禁止**仅生成 **无提示空白页**；PDF 内 **须含可读占位**（实现可选用固定标记短语，**须** 走 i18n 键，与 [路线图 2.7.1](../execution/plans/写作页开发路线图-2026-04-22.md#27-体验安全迁移与生态补充) 一致）。

**编译行为**：默认 **`typst compile` 不因单块 raw LaTeX 失败**；由 **生成 `.typ` 的受控管线** 插入 **已定界占位盒**（等价语义：**不**把用户 LaTeX 原样喂给 Typst 当可执行内容）。

**CI 断言**：fixture 含 **至少一块 `raw-latex`** 时，对产出 PDF 须满足 **（a）文本层可抽取到占位标记子串** 或 **（b）随构建写入的 sidecar JSON / 日志字段** 之一，**防止**「静默空版式」回退；断言形态在 **首个实现 PR 与本节同 PR** 定稿。

## 决策（骨架）

1. **验收真源**：以本机或 CI 固定版本的 **Pandoc + Typst** 为「黄金路径」，承诺 **docx / html / tex / pdf（Typst）** 导出；其中 **pdf** 指 **`typst compile` 产出的 PDF**。**版本号** 以 **[版本表](#版本表-单一工程真源)** 为准；**模板** 与 **`kind` → Typst** 以 **[映射基线（v0 stub）](#kind-typst-映射基线-v0-stub)** 为文档真源，代码实现须在 PR **对照更新**，**禁止**无表合并。
2. **纯 Web 降级**：以可下载源码包 + 本地脚本或可选 Worker 为默认叙述；具体命令与 zip 布局在实现阶段补全。
3. **Pandoc WASM 观察项**：纳入 G0.5/G1.5 时间盒 spike，验证浏览器内 md → docx/HTML/TeX 与 Lua filter 子集可行性；结论写回路线图与本 ADR。
3b. **Typst WASM 观察项（可选，C 档）**：评估浏览器内 **Typst 编译器 WASM** 生成 **子集 PDF** 的可行性、包体大小与失败 UX；**不得**默认同等于 CLI golden；结论写入本 ADR 与路线图 [附录 E](../execution/plans/写作页开发路线图-2026-04-22.md#附录-e--技术栈与上游调研)。
4. **版本锁**：`defaults`、模板、Lua、Pandoc minor、**Typst compiler minor**、项目 `typ` 依赖（如 `@preview` 包）**全部** 写入 **[版本表](#版本表-单一工程真源)**；升级须 **同 PR** 更新本节 + golden（若变）。
5. **混合策略（默认产品形态）**：**同一 Markdown 真源**；**按用户本机是否具备 Pandoc / Typst CLI 分档**，应用内 **环境探针 → 分档 UI → 显式降级**；**不** 向所有用户假装存在单一路径。分档表见下节；与 [路线图 2.4](../execution/plans/写作页开发路线图-2026-04-22.md#24-导出运行时决策树须在-g0-收口g1-前成文) **书面一致**。

## 混合策略（分档说明）

**目的**：用 **用户可选的本地依赖** 弥补纯前端在 **完整 Pandoc/Lua、可复现 golden** 上的硬缺口，同时保留 **零安装用户** 仍可编辑与带走源码的工作流。

| 档 | 用户环境（典型） | 导出与承诺边界 | 应用内职责 |
|----|------------------|----------------|------------|
| **A · 完整本地** | 已安装与路线图/版本表一致的 **Pandoc + Typst CLI**（或团队提供的 **Docker/devcontainer** 等价物） | **四出（docx / html / tex / pdf）** 为 **对用户承诺的主路径**；**pdf** 走 **Typst**；与 **CI golden** 同一套 `defaults`/模板/Typst 入口 | **探针成功** → 提供「本地导出」入口（调用 CLI 或文档化 bridge）；失败时 **人类可读原因 + 诊断包** |
| **B · 轻量本地** | 仅有 **Pandoc** 或仅有 **Typst** 之一（另一缺失） | **可导出子集**须在 UI **逐格式**标明（例如：有 Pandoc 无 Typst → 无 **PDF** 按钮或灰显 + 安装链） | **分档提示** + 链到安装文档；禁止静默降级 |
| **C · 零本地** | 不装 CLI | **不承诺** 与 A 档 **像素/版式等价** 的浏览器内 PDF；**默认** [路线图 2.4](../execution/plans/写作页开发路线图-2026-04-22.md#24-导出运行时决策树须在-g0-收口g1-前成文) 所述 **zip（md + yaml + manifest）+ README 脚本**（脚本可编排 **本地** `typst compile`）；**Pandoc WASM / Typst WASM** 仅作 **可选观察/增强**（能力子集，见决策 3、3b） | **下载与诊断** 为主；任何 WASM 能力须在 UI **标明子集与限制** |

**横切要求**

- **真值与回归**：**验收与 CI** 仍以 **A 档（或等价 CI 镜像）** 为黄金路径（决策 1）；B/C 档为 **产品可用性** 而非替代真值。  
- **安全**：应用触发本机命令时须 **白名单、工作目录约束、用户可见完整命令行**（实现阶段写入本 ADR 正文或子文档）。  
- **与路线图 2.7 对齐**：**spawn / 本地 bridge 安全自检表**（[2.7.3](../execution/plans/写作页开发路线图-2026-04-22.md#27-体验安全迁移与生态补充)）与 **`/writing` CSP v0**（[2.7.5](../execution/plans/写作页开发路线图-2026-04-22.md#27-体验安全迁移与生态补充)）在实现 PR 与本 ADR **交叉链接**，避免口径仅停留在本节一句话。  
- **诚实**：各档差异须在 **首次导出前** 与 **失败时** 可感知，避免「同一按钮、不同用户、不同语义」。

## 影响

- 导出相关 CI job、文档与客服/用户说明须与本 ADR 一致；**用户文档须显式写清 A/B/C 三档** 与安装最短路径（含 **Typst** 与 **PDF vs TeX 语言学版式** 差异）。  
- **预览 Worker** 与导出共享 Pandoc 版本/defaults 策略；`check:build-budgets` 须计入 **预览 worker chunk**；若引入 **Typst WASM**，须单列 **worker / 懒加载** 预算。  
- 不在本 ADR 阶段写入应用内「一键云端编译」承诺。  
- 浏览器内编译路径进入观察清单，且 **仅服务于 C 档可选增强**；**不**改变「开发者/CI / A 档本地」的验收与 golden 地位。

## 已重新评估的备选方案（记录用）

- 默认承诺 **浏览器内** 与 CLI **完全等价** 的 PDF，且覆盖 **任意 CTAN / raw LaTeX** 语义（仍不采纳）；**Typst PDF** 为 **声明子集** + **结构化 `kind` 映射** 为主，**raw LaTeX** 块在 PDF 路径上须有 **显式降级**——**默认 UX / CI 断言** 见上文 **[raw LaTeX 在 Typst PDF 路径上的降级](#raw-latex-在-typst-pdf-路径上的降级-默认决策)**（**TeX 导出** 仍为完整 LaTeX 真值）。
- 直接将 Pandoc WASM 或 Typst WASM **单独**升格为 **唯一** 默认导出路径（暂不采纳；**A 档 Pandoc + Typst CLI** 仍为 golden）。

## 后续回顾点

1. 首次 G1.5 **四出**（docx/html/tex + **Typst PDF**）CI 通过后，将本 ADR `status` 置为 `accepted` 并补全命令与镜像指纹。
2. G0.5 结束前补齐 Pandoc WASM 观察记录（能力、限制、失败回退、体积与冷启动数据）。
3. G1.5 后补齐 Pandoc WASM 子集可行性结论；若通过，再评估是否新增受控开关路径。
4. 若引入托管 Worker，新增 superseding 段落或子 ADR。  
5. 首次面向用户开放「本地导出」前，须具备 **探针 + 分档 UI + 安装文档** 的走查记录（与混合策略一致）。
6. **G1 切片 B**：首次 **Pandoc HTML 预览** 合入后，补齐 **iframe sandbox / debounce 预算** 与 **HTML golden** 的 PR 记录。
7. **官方一键环境**：devcontainer 或 `scripts/` 路径首次合入后，在本 ADR 正文写明 **入口命令** 与 **与 CI 镜像对齐方式**。
8. **版本表与映射表**：G0.5 结束前 **[版本表](#版本表-单一工程真源)** 至少 **Pandoc + Typst** 两行填实；G1.5 前 **kind → Typst** 表与 **raw LaTeX 降级** 与首个 **PDF golden** 同 PR 闭合。
9. **预览触发与宿主**：首次合入 **Pandoc HTML 预览** 的 PR **须** 对照 **[HTML 预览触发策略](#html-预览触发策略-工程约束)** 与 **[宿主与打包形态](#宿主与打包形态-导出能力边界)** 写明默认形态（纯 Web / 是否另有桌面发行）及 **debounce 数字**。
