---
title: ui-ux-modernization requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-10-24
source_of_truth: ui-ux-modernization-spec
---

# Requirements — UI/UX修正与视觉迁移

## 1. What & Why

- 先完成全项目UI/UX与运行态审查，修正已证实问题，再将批准的新外观落到真实产品。
- 解决交互、信息层级和反馈问题随换肤延续的风险；禁止卡片层层嵌套。
- 范围为既有功能；不新增研究/写作工作台，不扩充AI/协作/声学能力，不改变存储模型。
- 排期、覆盖矩阵和阶段门槛以[实施计划](../../plans/UI-UX审查修正与视觉落地-2026-10-24.md)为准；本spec管理后续装配/flag改动。

## 2. 用户场景

1. 使用者从项目进入媒体、转写、标注、词典、语料和语言资产时，理解当前对象与范围，编辑可保存并重新读到。
2. 使用键盘、中文输入法、放大字号和多面板时，核心任务可完成，焦点与草稿连续。
3. 导入/保存/服务失败或未配置时，能理解实际状态、保留输入并安全恢复。

## 3. 验收标准

- [ ] G0/G1覆盖全部可达页面、菜单、快捷键和条件功能；每项有运行证据或明确不可达原因。
- [ ] G2确认的P0/P1/P2交互问题修正并复验后才进入G3；待复现核心风险不得直接放行。
- [ ] 新旧外观共用领域操作；保存/恢复/切换项目经真实入口、重开读回验证，不跨项目误写。
- [ ] 全部实际组件状态和1440×1000/1280×720/1920×1080布局通过；200%文字不丢内容或操作。
- [ ] 无层层嵌套卡片；容器边框≤2层；主题/文案复用语义token和字典。
- [ ] flag关闭保留旧视觉，已验证的行为修复有效；现有外观偏好不被强制覆盖。
- [ ] Chromium开发验证和Electron真实项目验收分别记录；桌面未验证不能标最终完成。
- [ ] 无新依赖、业务功能或schema迁移；无回归后试运行至少1周再切默认。

## 4. 受影响代码地图

| 类别 | 文件/目录 | 改动性质 |
|---|---|---|
| 壳层/页面 | `src/App.tsx`、`src/pages/*Workspace*.tsx`、`HomePage.tsx`、`LexiconPage.tsx` | 既有装配/渲染适配 |
| 转写 | `TranscriptionPage.ReadyWorkspaceLayout.tsx`、`TranscriptionPage.ChatWindow.tsx`、时间轴组件 | 布局及已证实交互修正 |
| UI | `src/components/ui/`、`src/components/layerActionPopover/`、设置/恢复组件 | 复用接口、条件文案与状态 |
| 样式/主题 | `src/styles/tokens.css`、`foundation/`、`panels/`、`pages/`、`src/utils/theme.ts` | 按owner与flag适配 |
| flag | `src/ai/config/featureFlags.ts` | 新外观试运行注册，默认false |
| controller/hook/service | 仅审查证明需要修改的现有入口；首批含`src/hooks/ui/useRecoveryBanner.ts`核查 | 根因修正；不预建新模块 |
| i18n | `src/i18n/dictKeys.ts`、`dictionaries/*` | 中英文状态及字段说明 |
| 测试 | 同目录定向Vitest、`tests/e2e/` | 真实任务回归与视觉证据 |

## 5. 风险与依赖

- ADR-0064冻结边界先核对；本次仅交付计划和spec，不启动产品代码修改。
- ReadyWorkspace文档域/波形壳边界、时间轴单host、300行/12hooks和CSS owner约束必须遵守。
- 全局样式可能影响全部页面；先旧外观修正，再带flag迁移并检验关闭路径。
