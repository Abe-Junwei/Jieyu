---
title: 录音层转写模型接入 tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-11-22
source_of_truth: desktop-recording-stt-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# 任务（阶段 A 范围已校正，精稿待确认，未开始实施）

## P0 方案与基线

- [x] 按2026-11-22反馈将A并入5a：本机配置记忆、两类已存录音识别/草稿确认、>30秒硬切；B/C/D归第二程#285与#303/#305一起做。默认关闭，不关#303/#305/#306，不作首发阻断。
- [x] 明确不并入1b或5b：#603已交短录音链不重做，录音层用草稿确认，助手听写才用ToolLoopAgent。
- [ ] 核对既有设置/凭据/IPC与权限端口，固定profile字段和任务身份；验证：代码地图与无重复存储设计。
- [ ] Pixso读取并补设置与卡片全状态精稿对照，确认后转active；验证：帧ID与状态清单。
- [ ] 采集纯合成短句、35–90秒跨块、静音及两语种样本，记录已有CLI冷/热时间；验证：基线记录不作准确率承诺。

## A · 切片5a本机录音闭环

- [ ] 先用 `desktopModelCandidatesEnabled` 同时控制候选面板、所有口译/语音卡片转写入口与回调；验证：false不可触发，true未配置可引导。

- [ ] `transcriptionProfiles.ts`配置原子保存与重开恢复；验证：丢文件/坏哈希/旧版本配置不授予失效模型。
- [ ] `localWhisper.ts`复用清单与授权恢复，配置不再依赖候选页内存；验证：取消选择不破坏现有模型。
- [ ] `projectTranscription.ts`传递模型支持码与任务身份；验证：明确映射才传，无法映射让用户选择/显式auto，不裁剪locale/Glottocode/BCP-47/自定义码猜测。
- [ ] >30秒按能力整段或maxAudioSec无重叠硬切并顺序组装；验证：完整覆盖/末块、全部成功才交草稿，任一失败不提交；切点拆词/重复为已知上限，不加静音或去重算法。
- [ ] 复用 `oralClipWav.ts` 已存16kHz单声道PCM16，不另做转码；两类卡片接配置引导和阶段/耗时状态；验证：口译与语音层各写自己的子文字层。
- [ ] 单并发、取消与重试接既有退出链；验证：取消/切项目/Cmd+Q后无迟到写回，进程临时文件释放。
- [ ] 草稿确认与来源回归；验证：录音替换、已有草稿、手改、重开后确认的真实SQLite读回。
- [ ] 可见Electron合成输入闭环；验证：准备模型→识别→编辑确认→重开，失败能回到原录音。

## B · 第二程#285普通用户本机交付

- [ ] 固定Mac arm64 whisper.cpp构建/动态库清单与许可；验证：干净环境启动，不读开发机Homebrew。
- [ ] 固定Windows x64构建/动态库清单与许可；验证：干净环境启动，不依赖终端环境变量。
- [ ] 模型导入/下载写临时文件、校验后原子启用；验证：取消、断网、坏哈希、磁盘满均保留旧模型。
- [ ] 任意外部格式转码单独落B；验证：格式/采样率/失败清理，不改变A已存PCM16路径。
- [ ] cold/warm与内存基线；有证据再决定持久推理进程，不能误称常驻HTTP为模型常驻。
- [ ] 两平台签名安装包试验；验证：麦克风、离线识别、退出/卸载边界及模型路径可恢复。

## C/D · 第二程#285（与仍打开的#303/#305一起做）

- [ ] 官方whisper.cpp server固定版本适配与连接检测；验证：不是Jieyu协议也能调用，未授权不能指定任意远端。
- [ ] 按真实需求补Speaches适配；验证：字段/语言/取消/时间戳契约，不凭兼容声明通过。
- [ ] 外发项目授权与主进程凭据；验证：无授权零音频上传，密钥不进项目/导出/日志。
- [ ] 单一云API按当前模型能力适配；验证：401/429、超时、空结果、语言参数和无静默回退。

## 合并与交付门禁（每片独立执行）

- [ ] `npm run typecheck`；触及域 `vitest`，新增文件包含可失败的业务断言。
- [ ] `npm run check:architecture-guard`、`npm run check:agent-evals:smoke`。
- [ ] `npm run check:docs-governance`、`npm run check:dev-agent-workflow-verify`。
- [ ] Electron相关用例按CI desktop-flow，本机只跑 `npm run test:e2e:desktop-project -- --grep "<本片用例>"`。
- [ ] 真CLI/真HTTP/安装包各自提供证据，不把mock通过当真实模型验收。
- [ ] 每个commit/PR附实际验证与未验边界；本规格不自动创建issue或发PR。
- [ ] 一周自用后明确默认值；稳定一cycle清flag，全部任务结束按ADR-0051删除本规格目录。
