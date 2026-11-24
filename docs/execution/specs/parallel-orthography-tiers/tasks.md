---
title: parallel-orthography-tiers tasks
doc_type: execution-spec-tasks
status: active
owner: repo
last_reviewed: 2026-11-24
source_of_truth: parallel-orthography-tiers-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — parallel-orthography-tiers

## Implementation tasks

- [x] 宿主校验：`insertHostLinks` / `setHosts` 拒绝非 `time-aligned` 转写宿主，并拒绝转写内容的符号关联层挂第二个宿主。拖放落点同步。不改触发器，不升 `user_version` → 验证：`npx vitest run src/db/desktop/layerHosts.test.ts src/pages/desktopTranscriptionLayerDrop.test.ts`
- [x] 创建参数放进 `desktopTranscriptionLayerCommands.ts`。当前层是锚点就用它，已挂在锚点上就用那条，否则拒绝。hook 只调用，行数保持 < 300 → 验证：`npx vitest run src/pages/desktopTranscriptionLayerCommands.test.ts` 与 `wc -l src/pages/useDesktopTranscriptionLayerController.ts`
- [x] 菜单加「添加正字法转写」。正字法层与锚点平级，锚点用文字标出时间主人，不缩进。文案进 `dictKeys` → 验证：`npx vitest run src/pages/DesktopTranscriptionLayerStyleMenu.test.tsx`
- [x] 合并：确认框分开正式正文和未保存草稿。未确认不写库。确认后才把草稿拼进该层正式正文并删除草稿 → 验证：`npx vitest run src/db/desktop/unitMerge.test.ts`（写、关库、重开，正式正文与草稿不同的那一层）
- [x] 拆分：切正式正文。其他层草稿整段留在左段且不提交。确认期间正文或草稿变了就拒绝 → 验证：`npx vitest run src/db/desktop/unitSplit.test.ts`（含重开、保存、撤销）
- [x] `unitEdges` 增加按层清空一格。正字法层和翻译层的删除走清空，不走 `removeUnit`。锚点层仍删整段。撤销分别恢复一格或整段 → 验证：`npx vitest run src/db/desktop/unitEdges.test.ts`
- [x] EAF：符号关联转写层对每个宿主语段导出一条标注，空正文也写出。该路径不再因空正文跳过 → 验证：`npx vitest run src/services/EafExportBehavior.test.ts`
- [x] 桌面流程覆盖添加层、合并取消、从正字法层清空 → 验证：`npm run test:e2e:desktop-project -- --grep "正字法转写"`

- [x] 锚点删层保护：`layerStructure.ts` 在所有模式写入前拒绝有效正字法依赖；空正文也拒绝。核对先删正字法再删锚点、恢复及清除 → 验证：`npx vitest run src/db/desktop/layerStructure.test.ts`，从 `layers.delete` 调用到关库重开，覆盖普通删除/purge/migrate 拒绝且库不变。
- [x] 清空接线：补 `operationContract.ts`、`desktopCall.ts`、`sessionEdit.ts` 及 edge actions/controller 的层身份、批量、预览、回执和撤销；正式正文/草稿清空，本层录音笔记保留。覆盖正字法与翻译、键盘及波形入口；在 `src/db/desktop/unitEdges.test.ts` 从桌面调用验证按层撤销 → 验证：`npx vitest run src/db/desktop/operationContract.test.ts src/db/desktop/unitEdges.test.ts src/pages/desktopTranscriptionEdgeActions.test.ts src/pages/DesktopTranscriptionWorkspacePage.selection.test.tsx src/pages/DesktopTranscriptionWorkspacePage.waveMenu.test.tsx`，断言重放、撤销冲突及跨层内容不变。
- [x] 草稿冲突闭环：按 design 操作合同展示基线冲突、阻断普通/自动保存及再次拆分，提供保留、舍弃和显式覆盖左段；不自动重设基线 → 验证：`npx vitest run src/db/desktop/unitSplit.test.ts src/db/desktop/textSave.test.ts src/pages/useDesktopTranscriptionSplitController.test.ts src/pages/DesktopProjectReadPage.test.tsx`，覆盖重开、未确认不写、覆盖仅左段、右段保留和撤销。
- [x] 合并确认快照覆盖所有参与层；预览后任一正文或草稿变化均拒绝提交 → 验证：`npx vitest run src/db/desktop/unitMerge.test.ts src/pages/useDesktopTranscriptionMergeController.test.tsx`。
- [x] EAF 显式引用分支及父标注映射：覆盖空宿主正文、全空正字法层、两个独立锚点，解析 XML 断言类型/父层/引用正确，不仅断言字符串包含 → 验证：`npx vitest run src/services/EafExportBehavior.test.ts`。
- [x] 不适用：桌面 EAF 入口。2026-11-24 用户确认本片只完善序列化，桌面入口另做，不以此片测试声称桌面可导出。
- [x] Pixso 局部状态稿：补两个独立组、平级正字法、翻译层归属、时间主人文字和草稿冲突状态，读取节点并更新 design 对照后再做 UI；现有外壳可复用。

## Pre-merge gates（与 AGENTS.md 单人合并门槛一致）

- [x] `npm run typecheck`
- [x] 触及域的 `vitest`（路径见上列任务）
- [x] 不适用：`npm run test:e2e:chromium`。本片只改桌面转写，验收用 `test:e2e:desktop-project`
- [x] 触及编排 / 复杂度：`npm run check:architecture-guard`
- [x] 不适用：`npm run check:agent-evals:full`。不改 `src/ai/**`
- [x] `npm run check:agent-evals:smoke`
- [x] `npm run check:dev-agent-workflow-verify`
- [x] 触及 docs：`npm run check:docs-governance`
- [x] 不适用：Feature flag。设计第 5 节不启用

## 本地验证记录（2026-11-24）

- 21 个相关 Vitest 文件 / 288 项通过；补充菜单阻断、批量清空及确认指纹变化后，对应定向测试再次通过。工作区原有未提交改动保留，没有提交。
- `npm run typecheck`、`npm run check:architecture-guard`、`npm run check:agent-evals:smoke`（4/4）、`npm run check:dev-agent-workflow-verify`、`npm run check:docs-governance`、`npm run check:css`、`npm run check:css-class-contract` 通过。文档治理仍报告其他文档的既存路径警告。
- `npm run test:e2e:desktop-project -- --grep "正字法转写"`：1 项通过，隐藏窗口。覆盖菜单添加、含草稿合并取消、按层清空、拆分草稿冲突默认焦点及显式覆盖保留右段。实运行截图在该次 `test-results` 输出目录，不进 git。
- 新增模块及草稿/拆并控制器的定向 ESLint 通过。`check:ui-design-draft` 本地无 PR 正文时按脚本规则跳过，不将跳过记作 PR 门禁通过。
- Pixso 三张局部稿已用设计系统组件重做并核对截图；当前不包含桌面 EAF 导出入口，也未做打包版、Windows 或真实材料验收。

### 手测反馈回归（2026-11-24）

- 修复平级正字法行因视觉深度为 0 而不画树线接头；组内行缝也按宿主关系连续。名称保持平级。
- 新增工作区回归：验证平级名称、接头坐标。相关 3 个 Vitest 文件 / 45 项通过，typecheck、architecture guard、docs governance 通过。
- 定向 Electron 用例通过：在正字法层被选中时分别从正字法轨道和波形拖建；读回宿主新 unit，立即在两行找到同一 id 的可见空段，核对非透明底色。树线干线与接头在同一帧测得横坐标相同、纵向无间隙，并检查运行截图。
- 用户报告主层缺段随后自行恢复。本轮未稳定复现该暂态，未将其宣称为已修复，也未为此改动存储逻辑。

- 后续缩进澄清：译文保留向右一档，正字法平级。定向 Electron 已断言真实名称坐标并截图检查；首次创建语音层成功，重复创建显示已有同类层的具体提示。相关 3 个 Vitest 文件 / 51 项、typecheck、architecture guard、docs governance 通过。

- 树干线验收更正：此前检查的是名称右移，未覆盖用户要求。已将 Electron 断言改为竖向树干线坐标，先复现译文与正字法树干线同列，再修正为右移一档；相邻行列变化补横线。42 项定向 Vitest 与桌面回归通过，并核对新截图。

- 用户指定「层树·关系线 v2」（81:4474）后重新对照：移除上一版行交界阶梯线，主干沿宿主节点列贯穿子树，横接在子节点前留 4px；正字法保持平级语义。按宿主和子层列生成连续线段，经过同列其他节点时留空避让。44 项定向 Vitest、桌面回归、typecheck、architecture guard、CSS 检查通过，已核对运行截图。

## Commit 阶段证据模板

```
<标题，说明为什么要共用语段>

Verified:
- npx vitest run <上列路径> → pass
- npm run typecheck → pass
- npm run check:architecture-guard → pass
- spec: docs/execution/specs/parallel-orthography-tiers/
```

## Post-merge

- [x] 不适用：feature flag 自用周期。本片没有开关
- [ ] 全部任务勾完后删除 `docs/execution/specs/parallel-orthography-tiers/`
