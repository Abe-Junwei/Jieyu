---
title: desktop-4ws-slice1b-transcription-editing tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-11-17
source_of_truth: desktop-4ws-slice1b-transcription-editing-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — 转写切片 1b

> 每片单独 PR：开工前在本文件补该片落位与测试并经用户确认，再实现。每片附 Electron 合成证据。2026-11-17 用户确认顺序与「v29 单独升级」。

## 每片开工清单（动产品代码前，逐项写进该片 issue 或本文件）

0. 规范：读 design §4「必须遵守的既有规范」中本片对应条款原文，逐条写「怎么遵守」；与条款冲突的设计回用户定，不自行改规则。
1. 盘点：本片涉及的现有代码，列文件与行号（单库、宿主、页面、可复用组件）。
2. 审查：对照 ADR-0100 E06、EF-018 与本规格逐项核对现有行为；发现的问题先写成会失败的测试。
3. 结论：每项写「直接用 / 改着用 / 自己写」与理由；只有引入新做法时才补业内调研（design §1 格式）。
4. 用户确认后才实现。

## 前置（[#559](https://github.com/Abe-Junwei/Jieyu/issues/559)）

- [ ] 1a 合入（[#556](https://github.com/Abe-Junwei/Jieyu/issues/556)）→ 验证：1a 退出条件
- [ ] `useDesktopProjectReadController` 拆到 300 行内，删除 `rules.desktop.mjs` 中的例外 → 验证：`npm run check:architecture-guard`
- [ ] 主路线图 1b 行改为指向本规格，去掉「检查器」；北极星 user_version 与代码一致 → 验证：`npm run check:docs-governance`

## 小片

- [ ] 1b-0（[#560](https://github.com/Abe-Junwei/Jieyu/issues/560)）格式 v29：新 ADR；整数毫秒、开始早于结束、点层、拆合映射；`timeMs.ts` 唯一换算；格式冻结记录与旧库拒绝 → 验证：`npx vitest run src/db/desktop`（写→关→重开读回、半毫秒取整）
- [ ] 1b-1（[#561](https://github.com/Abe-Junwei/Jieyu/issues/561)）只读联动：波形／播放／时间轴，选择上提到页面并去检查器（修 [#550](https://github.com/Abe-Junwei/Jieyu/issues/550)） → 验证：页面 vitest + `test:e2e:desktop-project`
- [ ] 1b-2（[#562](https://github.com/Abe-Junwei/Jieyu/issues/562)）边界：默认单边、Shift 联动、吸附、键盘微调、拖动预览、非法回退、重叠／媒体范围拦截、撤销重做；新建与删除单段（复用 `createUnit`／`deleteUnitTree`） → 验证：单库与页面 vitest + 桌面流程
- [ ] 1b-3（[#563](https://github.com/Abe-Junwei/Jieyu/issues/563)）拆分：时间切点 + 文字位置、预览、新身份与映射、跨切点分析待复核、撤销 → 验证：同上
- [ ] 1b-4（[#564](https://github.com/Abe-Junwei/Jieyu/issues/564)）合并：同稿同层同说话人相邻、显示空隙、确认正文分隔、下级保留与冲突阻断（EF-018）、新身份与映射、撤销 → 验证：同上
- [ ] 1b-5（[#565](https://github.com/Abe-Junwei/Jieyu/issues/565)）点层：增删改移、同层同毫秒唯一 → 验证：同上
- [ ] 1b-6（[#566](https://github.com/Abe-Junwei/Jieyu/issues/566)）其余入口：多选（批量改说话人、批量删除、多段一次合并）、说话人与备注、说话人目录筛选（FR-032）、部分转写（FR-066/068）、馆藏音频手动定位（FR-082） → 验证：同上
- [ ] 收尾（[#567](https://github.com/Abe-Junwei/Jieyu/issues/567)）：flag 开路径完整桌面流程；自用一周后决定默认值；用户本人抽验 → 验证：主路线图 1b 退出条件

## Pre-merge gates（每片）

- [ ] `npm run typecheck`
- [ ] `npx vitest run src/db/desktop src/pages/DesktopTranscriptionWorkspacePage.test.tsx`（加本片新测试）
- [ ] `npm run test:e2e:desktop-project`
- [ ] 改旧组件 props 时：`npm run test:e2e:chromium`
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance`
- [x] 不适用：不触及 `src/ai/**`
- [ ] Flag `desktopTranscriptionWorkspaceEnabled` 保持默认 false

## Post-merge

- [ ] 全部勾完后删除本目录与 `desktop-4ws-slice1-transcription-shell/`（ADR-0051）
