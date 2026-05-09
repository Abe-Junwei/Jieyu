---
title: TranscriptionTimelineVerticalView 单文件 Vitest OOM 根治计划（2026-05-08）
doc_type: execution-plan
status: active
owner: repo
last_reviewed: 2026-05-09
source_of_truth: vertical-view-test-oom-remediation-2026-05-08
depends_on:
  - ../../../package.json
  - ../../../src/components/TranscriptionTimelineVerticalView.suite-a.test.tsx
  - ../../../src/components/TranscriptionTimelineVerticalView.suite-b.test.tsx
  - ../../../src/components/TranscriptionTimelineVerticalView.suite-c.test.tsx
  - ../../../src/components/TranscriptionTimelineVerticalView.suite-d.test.tsx
  - ../../../src/components/TranscriptionTimelineVerticalView.test.fixtures.ts
  - ../../../src/components/TranscriptionTimelineVerticalView.tsx
---

# TranscriptionTimelineVerticalView 单文件 Vitest OOM 根治计划（2026-05-08）

## 1. 问题陈述与基线

### 1.1 现象

- 命令：历史上单文件 `TranscriptionTimelineVerticalView.test.tsx` 在 `vitest run …`（或与 `useTranscriptionTimelineContentViewModel.test.tsx` 同批）时，进程曾以 **非零退出码** 结束。**已拆分为** `suite-a` / `suite-b` / `suite-c` / `suite-d` 四个测试文件，并由 `npm run test:vertical-view` **顺序四次 vitest** 跑满以降低堆峰值并规避 `suite-c`+层头菜单用例同进程的 worker 挂起。
- 日志根因：**Vitest worker `JS heap out of memory`**（`ERR_WORKER_OUT_OF_MEMORY`），不是断言失败。
- 常见进度：约 **39–41 / 42** 条用例已执行后 worker 被终止；总耗时可达 **15–35 分钟**（环境相关）。
- stderr 中的 `[TranscriptionTimelineVerticalView] cell save failed` 来自用例内模拟失败路径，**不是** OOM 的直接原因。

### 1.2 仓库内相关事实

- 纵向对照视图测试：**原单文件约 1800+ 行、42 用例**；现为 `suite-{a,b,c,d}.test.tsx`（`suite-d` 仅含「层头上下文菜单 → 元信息 dialog」一条，单独进程避免与 `suite-c` 同 worker 时线程池不退）+ 共享 `TranscriptionTimelineVerticalView.test.fixtures.ts`，均为 `@vitest-environment jsdom` 且 `import 'fake-indexeddb/auto'`。
- `afterEach` 已做 `cleanup()` 与 `mockShowToast.mockReset()`；部分用例内另有手动 `cleanup()`。
- **`npm run test:vertical-view`**：`suite-a` / `suite-b` / `suite-d` 为 **8192MB**；**`suite-c` 单独 12288MB 且 `--pool=forks`**（默认 vite 的 `threads` 池在 jsdom 下曾对 `suite-c` 出现长时间 GC 后 `ERR_WORKER_OUT_OF_MEMORY`）。若仍紧，整链用 **`npm run test:vertical-view:large-heap`**（各段 12288，`suite-c` 仍带 `forks`）。`suite-c` 末条用例在断言 dialog 后会 **`Escape` 关闭**，降低残留门户风险。裸 `npx vitest run …` 未带同等 `NODE_OPTIONS` / pool 时更容易 OOM，请以 script 为准。
- **可执行性**：在普通 shell 中 **`cross-env` 与 `vitest` 通常不在全局 PATH**（依赖 `npm run` 注入 `node_modules/.bin`）。文档中的「权威跑法」**必须以 `npm run …` 或 `npx cross-env … npx vitest …` 表述**，避免复制粘贴即失败。

### 1.3 根治目标（DoD）

1. **硬指标（单文件）**：在 CI 等价参数下（默认 `8192` 或 `large-heap` 的 `12288`，`--maxWorkers=1`），**仅** `TranscriptionTimelineVerticalView` 相关 Vitest（`npm run test:vertical-view` / `test:vertical-view:large-heap` 或等价）**连续 10 次全绿且无 OOM**。
2. **硬指标（双文件同批）**：与现象一致，须覆盖 **与 `useTranscriptionTimelineContentViewModel.test.tsx` 同批** 的跑法（`npm run test:vertical-view:content-vm-batch` 或等价）**连续 10 次全绿且无 OOM**，避免「单文件绿、组合仍 OOM」的假关闭。
3. **软指标**：单次全文件跑完时，heap **无持续单调爬升**（泄漏已消除或已记录可接受的峰值来源）。
4. **阶段 A 最小证据（结案必填）**：至少 **一份** `--logHeapUsage` 或等价 heap 记录，以及 **一份** 二分/区间定位的书面记录（见 §2）；否则不得以「偶然通过」结案。
5. **工程指标**：贡献者默认走 **`npm run test:vertical-view`**（及 batch script），不依赖裸 `cross-env`/`vitest` 在 PATH 中。

---

## 2. 阶段 A — 可复现与量化（优先，约 1 个工作日内）

**目的**：区分「峰值高」与「线性泄漏」，并锁定陡增区间。

| 步骤 | 内容 | 验收 |
|------|------|------|
| A.1 | **推荐**：`npm run test:vertical-view`（a/b/d 为 8192MB，**`suite-c` 为 12288MB + `--pool=forks`**，四段顺序 vitest）。**备选**：单 suite 手动跑时 `suite-c` 须与 script 同口径（堆 + forks）；仍紧则用 `test:vertical-view:large-heap` | 可稳定复现或确认仅在低配失败 |
| A.2 | 开启 heap 观测：`npx vitest … --logHeapUsage`（Vitest 4.x CLI 已支持）或 Node `--heapsnapshot-near-heap-limit` 在崩溃时落盘 | **结案前至少保留 1 份** 表格化 heap 日志或快照索引（路径写入 §10 执行记录或 `docs/execution/audits/` 短附录） |
| A.3 | 用 `vitest -t` 或按 `describe` / 行号区间 **二分** 拆跑，标出内存/耗时异常段；仓库提供 **`npm run stress:suite-c`**（默认 **10×** 全文件、`12288MB`+`forks`）与 **`npm run stress:suite-c:per-test`**（逐条 `-t` + `--logHeapUsage`、`8192MB`+`threads`，用于复现 threads 池问题时做单测二分） | **结案前至少 1 份** 书面记录：哪一段前后 heap/耗时台阶式上升 |

**产出**：A.2 / A.3 为 **DoD 必填最小证据**；可附在 `docs/execution/audits/` 或本计划 §10，篇幅不限于长文。

---

## 3. 阶段 B — 测试层根治（优先，约 2–5 个工作日）

**目的**：在不改产品行为的前提下，消除测试套件内的累积与泄漏。

| 步骤 | 内容 | 验收 |
|------|------|------|
| B.1 | **IndexedDB / fake-indexeddb**：审计多用例间是否累积 DB；必要时 `afterEach`/`afterAll` 清理或每段 `describe` 独立 db 名前缀 | 二分区间内 heap 不再单调涨 |
| B.2 | **异步与定时器**：`waitFor` 超时、`vi.useFakeTimers` 对称恢复、`requestAnimationFrame`/`setInterval` 在测试结束可收敛 | 无悬挂 timer；相关用例单独跑 10 次稳定 |
| B.3 | **afterEach 补强**：除 `cleanup` 外，对 `window`/`document` 监听、`matchMedia`、ResizeObserver 等测试侧补丁做对称 teardown | 快照中 detached 监听减少 |
| B.4 | **工厂与闭包**：`makeEditorContext` 等大 `Map` 构造是否被闭包长期引用；抽 **fixture helper** + 明确 `unmount` | 单用例堆峰值可控 |

**原则**：本阶段未用运行时证据证明为产品泄漏前，**不**大规模改动 `TranscriptionTimelineVerticalView.tsx`。

---

## 4. 阶段 C — 组件 / 产品路径（条件触发，约 3–7 个工作日）

**进入条件**：阶段 B 完成后，heap 仍呈**跨用例线性上升**，且快照指向组件内订阅或未清理副作用。

| 步骤 | 内容 | 验收 |
|------|------|------|
| C.1 | 审计 `TranscriptionTimelineVerticalView` 及子树：`useEffect` 订阅、`addEventListener`、MediaQuery、IntersectionObserver 等 **unmount 对称清理** | unmount 后关键监听为 0 |
| C.2 | 若测试故意渲染极大列表：生产路径评估 **数据规模** 或测试专用 **缩小 fixture** | 测试内存峰值下降且行为覆盖不变 |

---

## 5. 阶段 D — 结构与 CI 防回归（可与 B 并行，约 1–2 个工作日）

**目的**：从工程上降低单进程峰值，并统一入口。

**重要说明**：在 **`--maxWorkers=1`**（本计划推荐用于复现）下，多个 test 文件往往在 **同一 worker 内顺序执行**，**仅「拆文件」不必然**带来多段独立进程生命周期或显著削峰。若采用拆文件策略，须 **同时** 采用 **分命令 / CI 分片 / 多 job**（见 D.2 与 D.3 绑定），使各片段在不同进程或不同时间窗跑完，削峰才可靠。

| 步骤 | 内容 | 验收 |
|------|------|------|
| D.1 | **拆文件 + 分片执行（绑定）**：已拆为 `suite-a` / `suite-b` / `suite-c` / `suite-d`；本地由 `npm run test:vertical-view` **串联四次 vitest**（新进程重置堆）。CI 若仍紧，可改为 matrix **每 job 只跑一个 suite** | 各子文件在 CI 等价 `NODE_OPTIONS` 下单独跑满且无 OOM；全量通过分片汇总 |
| D.2 | **npm script**：`npm run test:vertical-view`（a/b/d：**8192MB**；**suite-c：12288MB + `--pool=forks`**）、`test:vertical-view:large-heap`、`test:vertical-view:content-vm-batch`、`test:vertical-view:heap`（`suite-c` 与默认链同口径，见 `package.json`） | 文档与贡献者默认走 script，不依赖全局 PATH |
| D.3 | **CI 分片 / 多命令**（D.1 的配套硬条件）：`.github/workflows/ci.yml` 中 `vertical-view-vitest-shard`（matrix `suite-a`…`d`：`suite-c` 为 **`NODE_OPTIONS=12288` + `--pool=forks`**，其余 shard 为 **8192** + 默认 threads；均 `--maxWorkers=1`）+ `vertical-view-content-vm-after-shards`。全量 `npm test` / `test:vitest*` 的 `vitest run` 带 `--exclude "**/TranscriptionTimelineVerticalView.suite-*.test.tsx"`，避免与分片重复 | 流水线无 OOM flake；与 D.1 同时验收 |

---

## 6. 刻意不作为（避免假根治）

- **仅**无限增大堆（如 32G）而不完成阶段 A/B：只能缓解，**不作为**本计划结案条件。
- **无** A.2/A.3 **最小证据**即宣称结案或大规模改生产组件：避免误伤与「偶然通过」。

---

## 7. 验证命令（权威跑法）

**首选（可复制、不依赖全局 PATH）**：

```bash
npm run test:vertical-view
```

**双文件同批（DoD 门槛之一）**：

```bash
npm run test:vertical-view:content-vm-batch
```

**阶段 A heap 观测（在单文件命令上附加）**：

```bash
npm run test:vertical-view:heap
```

**仍 OOM 时（与全仓 `test:vitest` 同堆上限）**：

```bash
npm run test:vertical-view:large-heap
```

**无 npm script 时的等价一行（使用 npx）**：

```bash
npx cross-env NODE_OPTIONS=--max-old-space-size=8192 npx vitest run src/components/TranscriptionTimelineVerticalView.suite-a.test.tsx --maxWorkers=1
```

全仓大堆对齐时，亦可：`npm run test:vitest -- src/components/TranscriptionTimelineVerticalView.suite-a.test.tsx --maxWorkers=1`（`suite-b` / `suite-c` 同理）；或直接 `npm run test:vertical-view`。

---

## 8. 风险与回滚

| 风险 | 缓解 |
|------|------|
| 拆文件后 import 循环或重复 setup | 抽共享 `*.fixtures.ts` / `*.test-utils.tsx` |
| IDB 清理误删并行测试数据 | 每 worker 独立 db 前缀或串行该目录 |
| 产品订阅修复引入行为回归 | 阶段 C 每项带 targeted 测试与手动 smoke 清单 |

回滚：按阶段独立分支或 revert；拆文件可保留目录结构，仅恢复单文件聚合需团队同意。

---

## 9. 与相邻工作的关系

- 与 **`react-hooks/exhaustive-deps` 收口**（`exhaustive-deps收口计划-2026-05-08.md`）正交：deps 已清零后，本问题仍由 **Vitest/jsdom/IDB/套件体量** 驱动，需单独闭环。
- 本计划关闭后，可在本文件 frontmatter 将 `status` 改为 `completed` 并在 `docs/execution/plans/README.md` 索引中标注。

---

## 10. 执行记录（可选登记表）

结案时在此或 `docs/execution/audits/` 填写：A.2 heap 产物路径、A.3 二分结论、DoD 两次 10 次跑法（单文件 / 双文件）的日期与执行者。

- **2026-05-08**：`npm run test:vertical-view` 与 `npm run test:vertical-view:content-vm-batch` 在默认 **8192MB** 堆、`suite-a`→`b`→`c`→`d` 四段 vitest 下已通过（本机单次）。`suite-d` 仅断言层头菜单至「层操作」下编辑/删除项可用，**不在 jsdom 内点击「编辑」打开 `LayerActionPopover`**（该路径曾导致进程长时间挂起；完整弹层交互建议走 E2E）。
- **2026-05-08（DoD 稳定性 + A.2 heap，本机）**：连续 **10 次** `npm run test:vertical-view` 与连续 **10 次** `npm run test:vertical-view:content-vm-batch` 均全绿（总耗时约 **3.2 min** 量级，视机器浮动）。`npm run test:vertical-view:heap`（`--logHeapUsage`）观测：`suite-a` **187 MB**、`suite-b` **183 MB**、`suite-c` **150 MB**、`suite-d` **150 MB**（各段为独立 vitest 进程末行 heap 摘要）。
- **2026-05-08（E2E）**：`tests/e2e/transcriptionVerticalReadingLayerMetadata.spec.ts` — 横向时间轴 **`.timeline-lane-header`** 上下文菜单打开「编辑该层元信息」`LayerActionPopover`，经 **Chromium / Firefox / WebKit** 全绿；关闭采用弹层标题栏 **`.layer-action-dialog-header .icon-btn` 最后一个**（避免与底部 `Cancel` 幽灵按钮产生 strict 双匹配）。
- **2026-05-09（A.3 压测 + 单测二分，本机）**：**15×** 全文件 `suite-c`（**12288MB + `--pool=forks`**）全绿，单次约 **1.6–1.8s**。**5×** 全文件（**8192MB + 默认 threads**，与历史问题配置接近）亦全绿、单次约 **1.4s**。逐条 `vitest -t`（8192MB threads + `--logHeapUsage`）13 条均通过；末条「vertical row rail context menu」单跑末行 heap 约 **141 MB**。结论：当前 HEAD 上 **未复现** 历史「suite-c 同进程长时间 GC / worker OOM」；若 CI 或他机再出现，优先用 **`npm run stress:suite-c:per-test`** 对照脚本内 `TEST_NAME_SUBSTRINGS` 改 `--pool`/`--heap-mb` 做半套二分（前半 6 条 / 后半 7 条可用两个 `-t` 正则合并跑）。
