# 展开侧栏修复与验收

日期：2026-10-24。范围：本轮侧栏审查确认的5类缺陷。结论：本切片浏览器开发态验收通过；不代表全部UI/UX计划或Electron真机验收完成。

本地提交：`f960c901`（`fix(ui): keep expanded sidebars live and navigable`）。提交钩子的严格ESLint、stylelint、格式化、完整typecheck、文案与链接守卫通过。未推送。

## 实施结果

| 原问题 | 修复 | 验证 |
|---|---|---|
| 转写片段区被压为1px/0px | overview、文件与片段组不再被连锁压缩；片段区保留可用下限，内容超过窗口时由既有侧栏外层滚动 | 1280×720，240/272/420px宽，100%/140%组合；实际片段区高度≥100px，首末片段可点击，底部工具可到达 |
| 词典/语料/分析摘要滞后 | 共享注册层将正文内容订阅与壳层标题订阅分开；没有取消防壳层循环的保护；无需逐页复制portal | 正文与事件回调实时更新且壳层渲染次数不增加；词典保存→刷新读回、语料勾选/取消、分析范围计数均通过 |
| 标注空态无文件入口 | 原有工具slot移出数据状态分支，保留文件与范围导航；句子工具仍由focused控制 | 无canonical标注句段时可见录音与返回转写入口；加载/失败分支不再控制slot挂载 |
| 长释义裁掉快捷入口 | 既有feature-stack成为明确的纵向滚动区域，长词/文本可换行 | 保存长释义并重开读回后，正字法快捷链接可滚动至视口内 |
| 设置竖向标签无键盘语义 | 上下键循环、Home/End、单一Tab入口、标签/内容关联与可访问名称 | 真实按键焦点、选中与tabpanel关联检查；原有鼠标/设置行为回归 |

附带整理：标注工具用细分隔线区分范围、检索与当前句子操作，链接采用主题语义色；“层工具”短标题替代冗长维护标题；词典移除“基础骨架”和未来开发占位说明。没有增加嵌套卡片、依赖、controller、存储写路径或新主题。

## 验证证据

- 红→绿：新增单元断言首先复现3项失败（动态正文、最新回调、设置方向键），修复后对应33项全部通过；扩大到8个相关文件为84项通过。
- 最终完整E2E：`CI=true npm run test:e2e:chromium -- --workers=4 --retries=0 --output=.superdesign/sidebar-fixes/final-e2e`：112通过、1个既有Firefox专用用例跳过、0失败、0重试。CI=true只复用先前已构建的同一份产品产物，不运行部署。
- 首轮6并发出现2项重试：新用例的全页键盘焦点不稳定，改为对resizer逐键定位并核对中间值；既有T44菜单悬停一次不稳定。最终关闭重试的完整复验二者首次通过，未修改/跳过T44，也未把首轮重试结果算作稳定验收。
- 首轮定向采集的两次失败来自测试脚本：标注异步导入未等提交、把表单值当innerText；随后修正等待条件和实际textbox值断言。长释义回读按产品既有trim规则断言，没有改产品存储行为。
- `typecheck`、`check:architecture-guard`、`check:css-architecture`、`check:panel-foundation`、`check:docs-governance`、`check:dev-agent-workflow-verify`、`check:i18n-hardcoded:changed`、严格源文件ESLint、强制R1–R8均通过；agent-evals smoke 4/4通过，报告已在仓库生成。
- 自动回归入口：`tests/e2e/sidebarContent.spec.ts`；共享状态及防循环：`src/contexts/AppSidePaneContext.test.tsx`；设置键盘与关联：`src/components/SettingsModal.test.tsx`。

最终截图在 `final-e2e/`：新增用例5张，跨页预检31张（含30张页面尺寸组合截图）。执行日志和R1–R8说明保留在本目录。

## 边界

没有在用户真实项目上导入或写入测试数据。未做Electron真机、全部深色主题/RTL、海量项目/多层压力、数据库加载失败注入；首页及资源弹窗的结构重排、新主题迁移继续按原计划排期。此次共享内容订阅适用于所有既有注册调用方，但语言资产弹窗保持registerSidePane=false，未为其新增侧栏。
