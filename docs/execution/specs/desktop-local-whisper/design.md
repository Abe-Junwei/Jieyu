---
title: 本机 Whisper design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-10-30
source_of_truth: desktop-local-whisper-spec
---

# 设计

> 2026-10-30 排期覆盖：已完成实现与验证保留，未完成的模型产品余项按 [ADR-0098](../../../adr/0098-model-delivery-followups-in-second-stage.md) 后移至第二程/后续模型队列，当前不实施，不阻塞第一程；不自动打开默认关闭入口。

## 1. 成熟方案扫描 / Research

- 后续接入候选与能力差异见文末「2026-11-22 调研备忘（非实施决定）」；仅作 Research 输入，不改本节既有选择与排期。

- 既有 modelHost 已有 HTTP 校验/取消，projectTranscription 已有启动快照、PCM16 分块、内存候选和持久采纳；既有 whisperCliJson 提供 CLI 参数与 JSON 解析。全部复用，不另造运行时。
- whisper.cpp CLI 官方样例支持 WAV 与 JSON 输出；沿现有 -ojf 参数，不接官方 /inference。https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.9.5/examples/cli/README.md
- Node spawn 使用参数数组，无 shell；error/close/AbortSignal 各自清理，不能只杀 HTTP 连接而遗留推理。https://nodejs.org/api/child_process.html
- Node HTTP 文档：取消监视 response close；request close 也会在上传结束触发，不能拿它代表用户取消。停止服务先 close 再 closeAllConnections。https://nodejs.org/api/http.html
- 对比 Electron utilityProcess：它适合独立 Node 服务；已有服务仅协调一个 CLI，此刀在主进程内启动回环 HTTP 与原生 CLI 子进程，少一层打包/启动协议，仍经 ModelHost HTTP。https://www.electronjs.org/docs/latest/api/utility-process
- 反模式：renderer 提供可执行路径、上传字段选文件、把 stderr 回显、通配 CORS、共享可预测临时名。改用 main 环境配置/系统授权、固定权重、错误码、来源守卫和 mkdtemp。
- 无新增依赖；Whisper MIT，权重 MIT，真正随包动态库/签名和清单另刀核对，不据本机成功声明分发完成。

## 2. 落位与执行

- effect/actions：src/tools/whisper-server/whisperProcess.js 抽现有 CLI 执行，whisperV1.js 实现边界与 HTTP；server.js 保留旧接口并复用。
- effect/actions：src/desktop/localWhisper.ts 持有当前会话服务、生成已核哈希声明、关闭连接；只接受已登记 SHA-256 的官方 tiny/base/small 权重，私有快照避免运行中原文件变化；main/preload 只做授权接线，不向 renderer 暴露任意路径参数。
- derived：既有 PCM16 RIFF 解析移为同名 JS + d.ts，Node 独立服务与 TypeScript 宿主共用，不复制解析器。
- state/actions：已有 useDesktopModelCandidatesController 增一个选择本机模型动作；DesktopModelCandidates 只绑定按钮，无新 controller。
- 启动/关闭均做代际检查，异步哈希/监听完成后复核会话；取消选择不改变当前模型。换项目/退出停止服务和当前任务。
- 验证：npx vitest run src/tools/whisper-server src/desktop src/pages/DesktopModelCandidates.test.tsx；npm run typecheck、test:e2e:desktop-project、test:e2e:chromium、check:architecture-guard、check:agent-evals:smoke、check:docs-governance、check:dev-agent-workflow-verify。真实引擎仅合成语音，不读取用户材料。

## 3. 工程边界

当前仅匹配 16 kHz 单声道 PCM16 WAV，其他格式/采样率仍拒绝；重采样转码与应用内下载归下一刀。tiny 只用于合成验收，不更改 Mac small / Windows base 首发选择。权重目录/哈希来自 https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/main?recursive=false&expand=false ，公开 tiny 下载后校验为 be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21。

服务只在当前应用会话内持有；重开需重新选择，不冒充持久模型注册。默认关闭现有候选 flag，自用与稳定周期清开关沿原规格，不关闭 #303/#305。

## UI 精稿对照

- 不适用：本规格不改桌面页面或桌面样式。后续切片若改 `src/pages/Desktop*.tsx`、`src/styles/**/desktop*.css` 或新建 `src/components/**`，在那次改动里改写本节。

## 2026-11-22 调研备忘（非实施决定）

本附录仅记录本次研究，不修改 ADR-0098 的冻结/后移决定，不实施、不打开 flag，也不将建议视为已通过验收。外部资料读取日期为 2026-11-22；运行时版本与服务能力需在实施时复核。

### 本次对齐的源码边界

- `src/desktop/localWhisper.ts`：目前模型选择是已登记哈希的 `.bin`，私有临时权重副本与会话授权；能力声明上限 30 秒。重开应用需重新选择，不是持久模型管理。
- `src/desktop/modelHost.ts`：目前是 HTTP loopback 的 `/health` 与 `/transcribe` 自有合同；不能将它称为 OpenAI-compatible。
- `src/desktop/projectTranscription.ts`：口译录音的 `transcribeWavClip` 对整段超能力上限拒绝；项目媒体路径接受 PCM16，64 MiB 文件上限，按模型最大时长硬切，不是 VAD/语义切分。
- `src/pages/DesktopTranscriptionAcceptPanel.tsx`：模型选择入口仍受默认关闭的候选 flag 控制。口译转录读取已存录音，结果作为 draft，并由原录音文件身份保护写回；不等于自动替换确认稿。
- `electron-builder.yml` 尚无 Whisper `extraResources` 配置；开发环境可执行文件可用不证明安装包已交付引擎。
- 上述是源码层边界，针对本次读码的测试证据由主审单列；本附录未执行真实模型或设备验收。

## 调研结论

口译短录音和语音转录层应共享「已保存音频 → 转录候选 → 人工确认」流程，但保留各自音频身份和目标层。第一版用完整文件请求即可，不要求边录边识别。优先适配既有 ModelHost 和 whisper.cpp CLI；另设用户现有 HTTP 服务与云 API 的提供方适配器。三种方式是执行位置之别，不是三个互不相干的产品。

“外部模型”应分清用户本机进程、用户指定的服务和第三方云。HTTP 地址也可能指向局域网或公网；不能把 HTTP 或 OpenAI-compatible 自动解释为本机、隐私安全或能力相同。任何本地失败都不应静默改走云端。

### 三种接入方式

| 方式 | 对使用者的便利 | 应用需要承担 | 建议定位 |
| --- | --- | --- | --- |
| 应用管理本机 whisper.cpp 子进程 | 安装准备完成后选择模型即可；可离线 | 平台二进制、签名、动态库、模型获取/校验、资源与进程生命周期 | 普通桌面用户主路径，承接既有 CLI 设计 |
| 用户已有本地/自建 HTTP 服务 | 填地址和模型；复用现成 GPU/服务器 | 协议适配、连接诊断、能力探测、认证、超时与取消说明 | 专业用户最短接入，不要求应用安装 Python/Docker |
| 远程云转录 API | 不下载模型；凭证可用即可请求 | 明示上传对象与目的地、密钥保管、限额、网络与计费错误 | 用户主动选择的可选提供方 |

应用管理的常驻 server 可以减少每段模型冷加载，但增加服务就绪、端口、崩溃重启与并发治理。是否从逐任务 CLI 改成常驻 worker，应先测短录音的加载耗时；现有设计明确不直接改接官方 `/inference`，本调研不变更该决定。

### 引擎能力矩阵与成熟度

| 候选 | 已有官方能力 | 主要代价 / 限制 | Jieyu 建议 |
| --- | --- | --- | --- |
| whisper.cpp | 原生 C/C++，Mac/Windows/Linux；CPU、Apple Metal 等后端；量化 | 模型与后端产物仍需分发；不同构建能力不同 | 优先复用现有适配，不自行实现 Whisper 推理 |
| SYSTRAN faster-whisper | Python + CTranslate2；CPU INT8、NVIDIA GPU、分段/词时间、批处理 | Python/PyAV/CTranslate2 与 CUDA/cuDNN 版本组合；不是现成桌面服务 | 用户自建服务后接 HTTP；暂不将整套 Python 打进 Electron |
| Speaches（旧 faster-whisper-server） | 独立项目，faster-whisper 驱动，声明 OpenAI API compatible | 非 SYSTRAN 官方服务器；接口兼容声明不证明每个字段/取消/新版模型一致 | 可选服务端样例，固定版本做契约测试后支持 |
| sherpa-onnx | 离线原生 ONNX Runtime，多平台、多模型家族 | 每个模型的语言、tokens、采样率与许可独立；CTC 不是任意语言通用能力 | 特定语言经实测后再选，不能按中文优势替换所有 Whisper |
| mlx-whisper | MLX Whisper CLI/Python；输出文件、模型选择 | Apple 平台路线，Python 与 FFmpeg 准备；不覆盖 Windows | Apple Silicon 用户可选后端，不做跨平台唯一方案 |
| OpenAI 云 API | 完整文件转录、语言上下文；具体能力依模型 | 上传、服务可达性、凭证、生命周期变化 | 可选适配，模型列表与能力配置独立于 UI |

whisper.cpp 的平台/后端、模型量级与许可见 [官方 README](https://github.com/ggml-org/whisper.cpp)。官方列出的未量化 tiny/base/small 权重约 75/142/466 MiB；这是权重量级，不是最终安装包大小。支持某 GPU 后端不代表随包二进制已包含该后端。

faster-whisper 的 [官方说明](https://github.com/SYSTRAN/faster-whisper) 要求 Python，PyAV 自带 FFmpeg 库；当前 NVIDIA 路线要求匹配 CUDA 12 / cuDNN 9。其性能表是特定硬件、精度与 beam 的观测，不能直接写成 Jieyu 性能承诺。`segments` 是惰性 generator，拿到对象不等于推理已完成。

[旧 faster-whisper-server 地址](https://github.com/fedirz/faster-whisper-server) 已重定向到 [Speaches](https://github.com/speaches-ai/speaches)。它提供成熟项目候选与部署入口，但本次没有安装或验证其生产稳定性，不能仅凭 API-compatible 文案宣称可无差别替换 OpenAI。

[sherpa-onnx 官方文档](https://k2-fsa.github.io/sherpa/onnx/index.html) 提供原生、多平台、离线推理；[预训练模型目录](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/index.html) 按具体语言和模型列出资源。田野语言、混合语码、地方口音、IPA 或自定义正字法必须单独评测。一个中文 Zipformer/CTC 模型的效果不能推出整个引擎的多语言效果；运行时许可也不能代替各权重许可。

[MLX Whisper 官方示例](https://github.com/ml-explore/mlx-examples/tree/main/whisper) 提供 `mlx_whisper`、模型参数和输出格式，安装说明包含 FFmpeg 与 Python 包。这是 Mac 可选加速路线，不能作为 Windows 安装方式。

### whisper.cpp 协议与进程注意事项

[官方 CLI](https://github.com/ggml-org/whisper.cpp/tree/master/examples/cli) 提供 `-oj` / `-ojf` JSON、`-l` 语言、prompt、进度以及 `--translate`（译成英语）。建议把应用内部输入固定为明确的 PCM16 WAV，结果读独立 JSON 文件，日志与业务结果分开；不解析 stdout 的人类排版文本作为稳定协议。

[官方 server](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server) 默认回环地址、`/inference` multipart 文件请求，提供 `--convert`（依赖 FFmpeg）。它的路径、字段和响应格式不能当成 `/v1/audio/transcriptions`。官方示例没有为本次建立“断开 HTTP 就一定停止推理”的保证，需要版本固定后的取消实测。

主 README 仍写 CLI 使用 16-bit WAV，而 CLI 帮助列出更多格式；这说明格式支持需按固定版本/构建实测。复用仓库已约定的 16 kHz、单声道 PCM16 输入，比依赖动态格式猜测稳妥。

[Node child_process](https://nodejs.org/api/child_process.html) 有 spawn 参数数组、AbortSignal 与 kill，但发送信号不等于已退出，子进程树也不自动得到完整处理。建议停止/超时先标记任务失效，终止本任务拥有的进程并等待退出，再清临时文件；不能杀用户自建服务。不要经 shell 拼音频路径、模型路径或提示词。

### OpenAI 云转录：必须按当日文档更新

2026-11-22 读取的官方 [文件转录指南](https://developers.openai.com/api/docs/guides/speech-to-text) 推荐 `gpt-transcribe`，写明旧 `whisper-1`、`gpt-4o-transcribe`、`gpt-4o-mini-transcribe`、diarize 与 translations 于 2027-02-26 停用；三个旧模型各自的模型页也标 Deprecated。[独立弃用清单](https://developers.openai.com/api/docs/deprecations) 同时列出这些模型与端点，通知日期为 2026-08-26，停用日期一致；这是当前可调用但已宣布退出的生命周期状态，不是已停机，也不影响本地开源 Whisper 权重。

| 模型 | 官方页确认的差异 | 接入判断 |
| --- | --- | --- |
| [gpt-transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe) | 当前推荐；原语转录，支持上下文、关键词、多语言提示 | 新云适配优先评估；不能假设旧时间戳参数仍支持 |
| [gpt-4o-transcribe](https://developers.openai.com/api/docs/models/gpt-4o-transcribe) | 旧 GPT-4o 转录模型，官方称较原 Whisper 改进识别 | 只做迁移兼容；官方效果说明不是田野语言验收 |
| [gpt-4o-mini-transcribe](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe) | 旧 mini 转录模型；独立计价、快照 | 独立能力配置，不按名称推断全部同 4o |
| [whisper-1](https://developers.openai.com/api/docs/models/whisper-1) | 旧 Whisper 云模型，支持 transcription/translation | 历史时间戳/字幕需求兼容，不做未来唯一路线 |

指南当前文件上限为 25 MB，格式包含 wav/webm/mp3/m4a 等；旧 whisper-1 支持词/段时间和字幕格式但不支持文件结果流式，4o 系列可流式返回文件转录结果。文件结果流式不等于边采集边上传。`transcribe` 保留原语；旧 `translate` 只生成英语，不能用于任意目标语翻译。建议首版只要最终文本；以后逐项加入时间戳、流式或说话人能力，不强行拉平。[官方迁移指南](https://developers.openai.com/api/docs/guides/transcription) 特别说明新模型使用 `languages` 多语言提示，旧模型使用 `language`，只改 model ID 不能保留全部能力。

### 建议的应用合同（待确认，不是现行代码事实）

1. 先保存录音，任务记录稳定音频身份、音频版本/摘要、项目、源 unit/层、目标层、选取区间与采样变换。口译录音转写依据它自己的音频，不误用原媒体；区间时间戳归一化时明确相对录音还是相对源媒体。
2. 所有提供方生成候选，不自动覆盖人工文本。用户确认时再复核源音频和目标版本；音频替换、删除、切项目或用户已修改文本后，旧结果不可直接写入。保留可审查的失效原因。
3. 候选 provenance 至少含提供方、模型/快照、运行时版本或权重摘要、转录任务类型、语言提示、音频身份、创建时间；不存 API 密钥。不把推测语言当人工确认语言，不把模型概率当统一置信度。
4. 状态区分排队、准备音频、加载模型、推理、候选可复核、失败、已取消。没有真实进度时显示阶段和已用时间，不编百分比。首版单并发，防止两段抢 GPU 或候选交错；有证据再加批量。
5. 取消分为 UI 不再接收结果和提供方真实停止计算。HTTP abort 可能只停止客户端等待；远端可能继续消耗。过期任务靠 task generation 拒绝晚到写回。超时后重试新任务，避免重复采纳。
6. 本机模型用有版本的清单：可信下载 URL、字节大小、SHA-256、语言覆盖、量化格式、运行时要求、权重许可。临时下载完成并校验后原子启用；下载可取消/重试，离线支持导入同样校验。识别失败不应自动下载大模型。
7. 用户配置服务显式记录 locality、协议、认证和能力。探测连接不上传真实材料；日志脱敏，不展示密钥和原始 stderr。自建服务需说明谁负责进程/模型下载。云请求前明示服务目的地，钥匙通过桌面安全存储管理。

### 建议分期与验收证据

- **第一期：完整文件到候选。** 两类录音调用同一任务接口；复用既有 CLI/ModelHost；用户明确选提供方，单并发、取消、超时、重试、人工采纳和旧结果隔离齐全。以保存→重开→读取确认的真实业务结果为证据。
- **第二期：减少配置负担。** 应用内模型导入/下载校验、设备诊断；固定一款 HTTP 服务版本做契约测试；按当前 API 增加一个云适配。覆盖断网、无磁盘空间、坏权重、服务不可达、401/429、异常 JSON、空音频、纯静音。
- **第三期：按实测补能力。** 模型常驻、长音频分块、词时间、VAD、批量或实时流式分别立项。低资源语言先用经授权的代表性材料和人工参考比较 CER/WER、专名、漏词/幻觉、代码转换和正字法，不能只测合成普通话。

尚未验证：真实麦克风格式、Mac/Windows 打包后可执行与动态库、各设备冷/热加载与内存、取消是否释放 GPU、自建服务字段兼容、云服务地区可达性/账户权限、任何田野语言的准确率。本文没有执行模型推理或外传用户录音。


### 本次代码核查补充与验证边界

- `whisperProcess.js` 每次请求启动 CLI；当前 HTTP 服务常驻不等于权重常驻内存。是否改为持久推理进程应按冷加载实测决定。
- `modelHost.ts` 已接受 language，但 `projectTranscription.ts` 两个业务入口尚未传递，当前实际走自动检测；语言应来自本次录音所用语言，不直接套界面 locale。口译层识别口译者自己录下的目标语，不把 transcription 当成原语音自动翻译。
- 旧 `OpenAISttProvider` 固定 `verbose_json` 与单数 language，不能仅改模型名称就复用于新的云 API。保留可重用的解析/错误处理，按提供方实际能力生成请求。
- 30 秒是当前本机适配上限，不是产品应静默截断的上限。口译超过上限必须有明确处理：能力允许时整段请求，否则分块合并成同一草稿、失败保留录音，不只识别前 30 秒。此项应在两类录音闭环一期解决，不以“以后支持长媒体”为由延后。
- 2026-11-22 本轮实际运行：`npx vitest run src/desktop/localWhisper.test.ts src/desktop/projectTranscription.test.ts src/desktop/modelHost.test.ts src/db/desktop/recordingClips.test.ts`，4 文件、25 项通过。未执行 `localWhisper.real.test.ts`，未做真实模型推理、安装包验证或外传用户录音；这些测试通过不等于外部模型已能开箱使用。
