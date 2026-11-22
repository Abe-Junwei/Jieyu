---
title: 录音层转写模型接入 design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-11-22
source_of_truth: desktop-recording-stt-spec
depends_on:
  - ./requirements.md
---

# 设计（阶段 A 范围已校正，UI 精稿待确认）

## 1. 成熟方案扫描 / Research

- 现状与官方依据见 [本机 Whisper 调研附录](../desktop-local-whisper/design.md#2026-11-22-调研备忘非实施决定)：已有 CLI/ModelHost/项目授权/草稿/来源校验；候选入口默认关、grant仅会话有效、口译30秒整段上限。
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) 承接跨平台原生执行；[官方server](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server) 的 `/inference` 与 Jieyu协议不同，需要明确适配。
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper)/[Speaches](https://github.com/speaches-ai/speaches) 可作用户已有服务；不把整套 Python/CUDA 装进 Electron。MLX与sherpa仅后续经具体语言验证的选项。
- [OpenAI转录迁移](https://developers.openai.com/api/docs/guides/transcription) 要求按模型能力生成参数；不复用固定 verbose_json 或仅替换model字符串。
- 采纳：复用既有写入/候选与任务机制，适配具体协议；先验证冷加载成本，再决定常驻推理。拒绝通用插件平台、自由请求模板和静默云回退。
- 阶段 A 不引新运行时依赖，继续使用已安装 CLI；随包whisper.cpp/权重及动态库的许可、安装体积和平台签名归 B，不能只计权重大小。

## 2. 产品流程与状态

- 设置中的「语音转写」管理模型；卡片「转成文字」使用当前选择，无可用配置则就近引导准备，不显示原始JSON或环境变量。
- A 首次本机：显式选择既有受支持权重与已安装 CLI → 校验 → 合成短音频自检 → 可用；重开恢复配置并复核资源，不自动识别或弹文件选择器。B 再提供下载/导入和随包引擎。
- 已有服务：选择支持协议 → 地址/模型/认证 → 无用户材料的连接检测 → 可用；第一刀仅支持本机回环，LAN/公网必须另经外发授权路径。
- 录音卡片：选模型与本次语言 → 准备音频 → 加载/识别 → 子层草稿待确认 → 人工保存；失败保原录音和正文，取消不提交。
- 状态：未配置、检查中、可用、准备音频、加载模型、识别中、待确认、失败、取消；无真实进度只示阶段/耗时，首期单并发。
- 口译识别口译者自己录下的目标语言；语音层识别自己录下的原语。转写不替用户翻译，不把自动检测语言写成人工确认语言。

## 3. 边界与落位

| 层 | state / derived / effect / actions / routing |
| --- | --- |
| 页面与卡片 | 只展示配置/任务状态、简单绑定，不拿密钥、不读任意文件、不直接请求服务 |
| 页面controller | 模型选择、语言映射、任务交互和刷新；复用 `oralControllerApi.ts`，不继续往页面堆回调 |
| Electron main | 配置与密钥、路径授权、网络/进程和退出；新增逻辑按职责落 `src/desktop/`，main只接IPC |
| `projectTranscription.ts` | 复用任务取消与模型授权，固定session/source/target，协调音频和调用，不另建agent循环 |
| `modelHost.ts`及协议适配 | Jieyu本机协议保持回环约束；官方whisper.cpp或Speaches分别适配，不放宽旧URL校验接云 |
| `recordingClips.ts` | 复用source fileId检查、文字草稿及provenance；正文人工确认，不增加第二套候选面板 |

- 拟新增文件仅按职责需要：`src/desktop/transcriptionProfiles.ts`（本机配置）、`transcriptionService.ts`（已支持HTTP协议）、页面 `useDesktopTranscriptionModelsController.ts`（配置交互）；每个 <300行，hook <12 hooks。不先建立通用factory/registry。
- 配置存应用userData（版本、模型路径/哈希、协议/地址、modelId、能力）；先复用既有偏好持久化与safeStorage入口。设备路径/密钥不写项目；项目只留明确授权及必要来源，不新增重复SQLite数据库。
- 能力只保留实际需要的字段：音频格式/采样率、最大时长/体积、语言参数、返回文本/段时间、取消范围。未知能力保守处理；不靠 `/models` 的200声称可转写。
- 模型配置恢复不等于项目外发授权恢复；切项目刷新grant且取消旧任务。配置替换时运行中任务使用启动快照。
- 层语言是目录 language_id，不是模型参数。仅明确映射到当前模型支持短码才传；本机协议虽接受 auto 或2–3小写字母，仍须校验 Whisper 支持列表。映射不上由用户本次选择或显式 auto，不裁剪标签/Glottocode/自定义码猜测。
- 已存新录音已由 `oralClipWav.ts` 转为16kHz单声道PCM16；A直接复用，不增加转码工作，任意外部格式转码归B。
- 任务固定 requestId、session、source fileId/摘要、unit/layer/target、语言、模型版本；只在源与目标仍有效时提交同一份草稿。重试用新任务身份，避免重复采纳。
- 大于30秒：优先按后端能力整段；否则沿用 `transcribeProject` 的 maxAudioSec 无重叠硬切，覆盖全部采样和末块，按序组装；全部成功才交一份草稿，任一失败不提交。已知上限：切点可能拆词或重复文字；A不做静音检测、小重叠或对齐去重，实测证明需要时另立算法任务。
- 原媒体长转写仍保留既有 `modelRuns` 采纳语义；录音层仍用正文草稿。只共用执行能力，不强行合并两种数据模型。
- 本机取消须等待本次CLI退出并清临时文件；外部HTTP取消标明仅停止等待时不保证服务器停止，禁止杀用户服务。网络失败不自动切云。

## 4. 切片与交付

| 阶段 | 范围 | 完成证据 |
| --- | --- | --- |
| A · 5a本机录音闭环 | 本机配置保存/恢复、支持码映射、两类已存录音任务、>30秒无重叠硬切、入口开关、取消/失败/迟到保护 | 两种录音→模型→草稿→确认→重开，来源与正文读回一致 |
| B · 第二程#285本机开箱使用 | 二进制/动态库随包、模型导入/下载校验与取消、任意格式转码、冷加载诊断 | 干净Mac arm64/Windows x64，无WHISPER_CLI，断网可识别 |
| C · 第二程#285已有回环服务 | 先固定一种官方whisper.cpp server适配；再按需求支持Speaches | 固定版本契约与真实服务；错误/格式/取消边界明确 |
| D · 第二程#285远程可选 | E11授权、主进程凭据、HTTPS、单个云提供方；LAN按外发处理 | 无授权零上传，401/429/超时不改正文、不回退 |

A并入5a现有模型链，不另开平行排期；B/C/D留第二程#285，与仍打开的#303/#305一起实施。A-B才组成普通用户完整本机交付，A不宣称开箱即用，安装包/下载/已有服务/云端均不是5a任务或退出条件。

5a复用取消、迟到结果拒绝、重开不自动重跑和冲突不覆盖正文，离线手工流程独立可用；录音卡片结果继续走既有文字草稿确认，不强行改成助手建议。1b不再并：#603已有短录音保存/播放/转文字交付证据，剩余为时间、拆合与无录音文稿。5b不并：听写是助手对话输入，走ToolLoopAgent；录音层推理不经过助手循环。

## 5. UI 精稿对照（开工前门槛）

- 本文为draft产品/工程规划，不是已审精稿。局部设置/卡片按 DESIGN.md §5按钮与错误状态、现有设置组件复用。
- 实施UI前用Pixso MCP读取文件 `va44BZLBUSYRQ7KoiO3PJw` 的设置、转写卡片与候选区域，补帧ID和状态对应；新模型配置区域先出精稿确认，再将本节转非draft。
- 必含未配置、检查中、可用、模型缺失、忙碌、>30秒、取消、网络/鉴权失败；失败可重试且原录音仍可播放。MCP不通停止UI实施，不以源码测试冒充精稿验收。

## 6. 授权、迁移与放量

- 本次确认的ADR-0098范围对齐归5a，仅A：应用内记住本机模型配置、两类已存录音识别/草稿确认、>30秒硬切。B/C/D仍归第二程#285，包含随包引擎、模型下载、任意格式转码、已有服务和云端，与#303/#305共同交付；不关闭 #303/#305/#306，不写成首发阻断，也不改其他冻结项。已接受ADR原文保留；长期协议/外发边界或DDL变化另补ADR。
- 已核对：`desktopModelCandidatesEnabled` 目前仅包候选面板，音频卡片的「转成文字」仍可点。A开工先将同一开关覆盖所有口译/语音卡片入口与回调；默认false，false时不可触发模型任务；true但未配置时引导准备。只有现有开关确实无法收口时才提更小专用开关。
- 自用至少一周后决定默认开启，稳定一个release周期再清flag；旧手工转写、录音保存播放独立可用。
- 尽量不迁项目schema；确有持久来源字段缺口才提最小迁移，按现有存储业务接口办理。不能将临时文件/secret.bin视为项目可移植数据。

## 7. 验证与退出条件

- 单测：配置原子写/恢复/资源失效，支持码映射/映射失败选择、无重叠硬切覆盖/末块/全成后提交，协议字段与输出校验，取消终止计算、清理、迟到不写。
- SQLite业务：两层类型分别write→reopen→readback，已有草稿/正文、录音替换/删除、目标手改和模型切换冲突；手改清provenance。
- Electron：从未配置开始到首次准备、>30秒识别、确认、重开、取消、Cmd+Q/留下/放弃；可见窗口用临时项目，不读用户真实材料。
- 真实引擎：合成输入+经授权代表性语言，报告CER/WER、漏词/幻觉/专名、冷/热耗时、RSS和安装体积；未设阈值的项目先建基线，不虚报通过。
- 合并：typecheck、触及域vitest、architecture、agent smoke、docs/workflow；desktop-flow以CI为门槛，本机只跑相关grep。B阶段Mac与Windows分别给安装包证据，A不以安装包门槛提前随包工作。
