---
title: 首发工程验收协议与实施分片
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-engineering-verification-spec
depends_on:
  - ../desktop-engineering-contract/design.md
  - ../desktop-field-editor/design.md
  - ../desktop-save-recovery/design.md
  - ../desktop-analysis-time/design.md
  - ../desktop-file-formats/design.md
---

# 验收协议与后续分片（未实施）

## 合成基线与计量

仅受控新项目，不读真实材料；固定seed、生成器版本及manifest哈希。100h有效音频、媒体实际字节50–51GB（十进制）、10万区间句段、100万词、5万词条；数量不把软删重复或备份字节算进正式规模。可用55h mono与45h stereo 48kHz/16bit PCM得到约50.112GB，头部另计；有非静音、可重复伪随机声学内容，不能以全零稀疏文件和极高压缩比冒充真实I/O。

至少100稿件、每稿2–6层、10%合法跨轨重叠、1万点事件；100万词含Unicode附标/多脚本/长词，200万语素含零形式和不连续；5万词条含2–5义项及重复发音/例句。各已接受宿主至少一种自定义定义且有值，类型全覆盖；分析历史每片段至少一个版本、10%待复核、5%持久草稿、2%可恢复删除对象（额外计量）。记录各实体数与JSON/DB字节，不仅填“含历史”。

基线机器实际8GB物理RAM、四核级CPU、SSD；分别记录Mac/Windows型号、CPU、OS、磁盘、空闲空间、电源/温度和构建。M系列多于四核的机器不能直接假称四核基线；限核结果独列，至少一台原生接近档位的机器。超出硬件时只记探索结果，不勾基线通过。

P95 nearest-rank，交互至少100次、切稿100次、保存100次；冷打开/每类查询至少20次，冷/热分开。冷启动区分应用进程重启与OS缓存冷态；不具备可控OS缓存时注明“应用冷、磁盘缓存未控”，不得冒充磁盘冷。冷开计时从用户确认目标项目到主编辑区可输入/播放准备状态，不以骨架可见结束。

保存分别记输入完成→触发、事务排队→持久回执、输入→持久总时长；E14“持久化≤1s”报告实际写入及总时长，不把debounce藏掉。可见反馈从输入/选择事件至对应帧可见，长任务监测>200ms界面冻结；不能只测JS函数耗时。

内存用全部应用主进程、renderer、worker/utility进程树实测，稳定值取编辑10min后窗口，峰值覆盖查询/50GB备份/导入。报告RSS/私有内存及平台指标，避免共享页重复加总假超标或只看renderer漏内存；不同OS指标分别给。系统交换量、失败/OOM和用户可操作性必记，本地AI禁用测核心。

查询集给固定真值：精确词形、标签别名、两词相邻/距离、同词gloss、跨层显式对应、重叠/负间隔、同稿有界跨段、多值同项AND、缺值否定、待复核局部、零语素。每例保存全部期望绑定与范围，常用集小于结果上限，不以截断缩短时间；大命中另测截断正确性。答案必须从独立明确合成规则生成，不用同一执行器给自己生成expected。

## 故障与安全证据

每个V01–V19记录build/seed/步骤/预期/实得/文件或DB重开读回。注入：提交前/后断IPC、第二表写入异常、磁盘满/权限拒绝、worker卡死/崩溃、owner退出、响应迟到、媒体复制中删除请求、文件目标替换失败、批量第n稿失败、映射变化、未知云请求。确认数据与副作用，不只mock调用次数。

使用受控目录和可丢弃文件；损坏测试在副本上，绝不改真实项目。依赖官方应用的ELAN/Praat/FLEx版本与文件hash列证据；LaTeX编译日志及页面截图，标准schema验证错误逐条记录。外部应用未安装或硬件不合规就是未验证，不能以单测替代。

## 核心键盘与焦点交接提案

| 操作 | macOS／Windows | 优先级与返回 |
| --- | --- | --- |
| 保存/flush | Cmd+S／Ctrl+S | 当前合法修改立即请求保存；非法保草稿，不能系统打印/网页另存 |
| 撤销/重做 | Cmd+Z/Shift+Cmd+Z；Ctrl+Z/Ctrl+Y及Ctrl+Shift+Z | IME先处理；文本控件本地草稿编辑先撤，跨对象业务操作由统一撤销控制器，不双重执行 |
| 播放/暂停 | Space | 仅非可编辑目标、无模态输入时；输入文字中Space保持空格 |
| 面板巡航 | F6／Shift+F6 | 导航→上下文→主区→检查器，折叠区跳过；焦点不强制改片段 |
| 下一/上一片段 | Alt+Down／Alt+Up | 仅时间轴/片段列表作用域；文本编辑保平台原行为 |
| 关闭顶层浮层 | Esc | composition优先，之后最顶层浮层，再当前临时操作；回触发点，触发点已消失回最近合法父入口 |
| 操作/遍历 | Enter/Space；Tab/Shift+Tab；方向键 | 依控件模式，复合列表单Tab入口/箭头内部，不能把所有单元塞无限Tab链 |

所有专用快捷键有可发现菜单/按钮及快捷键表；不截Cmd+Q/Alt+F4等OS关闭，接宿主退出协议。实际注册与现有ActionId对照后冲突校验，不能在两个controller各监听全局键；键盘提案不以静态表宣称无障碍通过。

## 数据依赖顺序及具体落位提案

先完成代码Plan确认，再拆成半天以内任务；下表是域切片，**不是授权一次性实施这些域**。现有文件继续承担原职责，新文件只为独立业务能力，不机械包薄hook。

| 顺序 | 复用／拟新增落位 | 一次验收边界与测试落位 |
| --- | --- | --- |
| 1 保存/草稿/退出 | `src/db/desktop/operationContract.ts`、`desktopCall.ts`、`projectSession.ts`；拟`operationReceipts.ts`/`editDrafts.ts` | 回执/草稿新载荷、读回/未知；对应`.test.ts`及Desktop工作区离开E2E |
| 2 图/时间资格 | `analysisGraphDomain.ts`、`src/db/desktop/analysis.ts`/`analysisRestore.ts`/`unitSpan.ts`/`manuscripts.ts` | 局部依赖、毫秒、拆合，扩`analysis*.test.ts`/`timeMapping.test.ts`/`unitSpan.test.ts` |
| 3 词典/字段 | `dmlexEntrySchema.ts`、`customFieldValidation.ts`/`customFields.ts`/`customFieldMigration.ts`；页面拟`useDesktopLexiconEditorController.ts` | 全字段、18宿主含例句提案、新类型迁移；`customField*.test.ts`及DesktopLexiconPage测试 |
| 4 协调/查询语言 | `projectSession.ts`；拟src/db/desktop/projectCoordinator.ts（拟新增）、src/services/corpusQueryLanguage.ts（拟新增） | 单写/只读、parser/AST和类型，新增同名test；独立查询SDD接后续 |
| 5 执行/结果UI | `corpusQuery.ts`、`DesktopCorpusQueryPanel.tsx`；拟`corpusQueryWorker.ts`/页面controller | 冷热答案集、取消/锁/过期，扩corpusQuery测试及桌面E2E |
| 6 AI任务与审核 | 复用`src/ai/runtime/`唯一ToolLoopAgent、`src/db/desktop/modelRuns.ts`、候选领域路径 | 不新建运行时；候选/云授权/迟到结果，扩modelRuns和analysisCandidates测试 |
| 7 文件/成果 | `foreignImport.ts`/`projectExchange.ts`/`dailyBackup.ts`、既有各serializer | 流式ZIP64、逐稿共享依赖与五种成果输出profile，扩exchange/exportSafety及格式测试 |
| 8 完整终验 | Electron现有smoke/桌面生产入口，合成容量协议 | 离线闭环＋全部V01–V19，8GB容量/外部工具证据，缺一不通过 |

每片代码变更前确认载荷版本及受控合成项目重建，不补真实旧库。高风险/大UI改变按仓库flag规则；首发时能力必须实际启用交付，不能以flag=false通过产品门。组件UI只装配，写入/并发在service与宿主，300行/12hooks和两层边框继续守。

## 检查命令与通过含义

已有可运行子链：`npx vitest run src/db/desktop/timeMapping.test.ts src/db/desktop/customFields.test.ts src/db/desktop/customFieldMigration.test.ts src/db/desktop/exportSafety.test.ts`。格式：`npx vitest run src/services/EafService.test.ts src/services/EafExportBehavior.test.ts src/services/TextGridService.test.ts src/utils/transcriptionIgtLatexExport.test.ts src/utils/lexiconLiftExport.test.ts src/utils/dmlexJsonExport.test.ts`。它们只证明当前旧实现，不是上述新用例已实现。

每片`npm run typecheck`＋定向vitest；交互加`npm run test:e2e:chromium`及Electron生产入口；结构加`npm run check:architecture-guard`，AI加`npm run check:agent-evals:full`；文档治理/工作流门照常。性能与外部工具测试另存受控证据，不把预设表格或mock快照当通过。

## 本轮实际检查（2026-11-01）

上述两组已有定向命令合并运行：10文件101项通过；`check:agent-evals:smoke` 4/4（含typecheck），文档治理与工作流检查通过。DMLex旧测试有`uri` format未启用的告警，不能据此宣称URI约束已验证；旧协作文档缺路径警告也仍在。新增JQ1/parser、回执/草稿、18宿主新类型、外部工具往返和8GB/50GB均未实施或运行，本轮没有勾对应产品门。
