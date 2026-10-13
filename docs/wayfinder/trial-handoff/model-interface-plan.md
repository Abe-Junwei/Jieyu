> 用户 2026-10-13 21:06 拍板（覆盖 §12 建议）：1 model_runs 冻结前定进格式（#275）；2 #303 = 第一个实现，用自带 whisper-server；3 首片只做转写；4 **令牌可选**，服务不支持令牌也能接，只显示警告；5 N1–N3 已开占位：#304、#305、#306（挂 #285）。

# 方案 v2：解语接入用户自带的语音/NLP 模型

日期：2026-10-13 · 版本：v2（按 `REVIEW_NLP_MODEL_INTERFACE.md` 修订；v1 原文未动）
代码基准：`origin/main` @ `1713321b`（只读核对，`git show origin/main:<path>`）
状态：方案稿。没开单，没改代码。挂 #285（第二程），**试用（#250）结束后再排**。

## 0. 结论

1. **按能力定接口，不按模型定。** 能力清单保留六种作为远景（VAD、转写、对齐、分词/切语素、注释、翻译），但**本程只做 `transcribe` 一种**。第二个真实模型出现后再抽象别的能力。
2. **只走一种传输：主进程 → 本机 HTTP（只限回环）。** 命令行、进程内 ONNX、MCP 都往后放。
3. **每个模型一个声明文件** `jieyu-model.json`：许可证用 SPDX，规定 id 冲突规则和书写系统映射。
4. **结果一律是候选**，只在统一的“模型候选”面板里由人接受或拒绝。来源记在新表 `model_runs`，**不用 `source_records`**。
5. **#303 本机 Whisper 就是这套接口的第一个实现**，不另起一条路。
6. **前提：桌面壳。** `origin/main` 里还没有 Electron 代码，“主进程调用”要等桌面壳（#276）落地，Electron e2e 依赖 #284。
7. 最小首片约 **4–5 周**（一个人），v1 估的 3 周偏乐观。

## 1. v1 → v2 改了什么

| 项 | v1 | v2 |
|---|---|---|
| 来源记录 | `source_records`，或新开表 | **只新开 `model_runs`**（`source_records` 是导入文件的来源表，语义不合） |
| 安全 | 只说“允许 127.0.0.1” | 回环监听 + 一次性令牌 + Host 校验 + 回环 IP 判定 + 严格校验响应 + 大小上限 |
| 合同 | 时间基准、采样率、长音频、版本都没写死 | 全部写死，见 §4 |
| 音频传递 | multipart 或共享 `audio.path` | **只用 multipart** |
| 进度/取消 | SSE + `DELETE /jobs` + `$/cancel` | 同步请求 + 主进程 AbortController + 超时；进度按块由解语自己算 |
| 结果界面 | 新层 / suggested / 对齐差异，三种做法 | 统一的“模型候选”面板 |
| 拒绝的结果 | 保留正文用于统计 | 只在 `model_runs` 上记计数，不存正文 |
| 训练集与知情同意 | 只做提示 | 缺授权记录的说话人默认不导出；可显式覆盖，并记日志 |
| 范围 | 4 期、11 张单、6–9 周 | 最小首片 3 张单 + 1 张前置修复，4–5 周 |
| 事实错误 | 见 §2 | 已更正 |

## 2. 更正的事实

- **whisper.cpp 官方 server 不兼容 OpenAI 格式。** 它的端点是 `POST /inference` 和 `POST /load`，默认 `--host 127.0.0.1`（https://github.com/ggml-org/whisper.cpp/tree/master/examples/server ）。兼容 OpenAI `/v1/audio/transcriptions` 的是**解语自己写的 Node 包装** `src/tools/whisper-server/server.js`（第 4、231 行），它内部调用 `whisper-cli`。所以 #303 选 whisper.cpp 官方 server 还是自带包装，要写明适配差异。
- **ELAN：** v1 链接 `archive.mpi.nl/tla/elan/recognizers` 已 404（本次复核仍是 404）。接口规格见 https://www.mpi.nl/tools/elan/docs/Avatech-interface-spec-2014-03-06.pdf ，手册见 https://www.mpi.nl/tools/elan/docs/manual/Sec_Audio_video_recognizer.html 。手册原话：AVATecH/AUVIS 的识别器“已不再作为 web 服务提供”，扩展也已从识别器页移除。v1 写的“Web 识别器走 CLARIN/BAS WebServices”已过时。
- **sherpa-onnx 不能做强制对齐。** 它提供 ASR、TTS、VAD、说话人分离、语音增强等（https://github.com/k2-fsa/sherpa-onnx ，Apache-2.0）。
- **对齐结果目前没有调用方。** `src/types/alignmentTask.ts` 和 `src/services/alignment/AlignmentTaskContract.ts` 除了自身的测试，全仓没人引用。没有写回词级时间的代码，没有冲突处理，也没有界面。v1 说“只缺执行器”说过了头。
- **capability 的真实取值**是 `'browser-native' | 'local-http' | 'cloud-api'`（`src/services/VoiceInputService.types.ts:127`）。
- **`SttResult` 是听写结果的类型**，没有 segments 数组；长音频转写用的是 enhancement 的 `segments`。本方案的转写合同另行定义，不直接沿用 `SttResult`。
- **`voiceProviderManifest.ts` 是内置的静态枚举**，healthCheck 只是写死的键名，不能从文件加载。“manifest 已经有了”偏乐观。
- **vadWorker 跑在渲染进程的 Web Worker 里**（onnxruntime-web），不是主进程的先例。

## 3. 现有代码能复用什么（已对照 origin/main 核实）

| 能力 | 现有代码 | 本程怎么用 |
|---|---|---|
| 转写 | `src/services/stt/LocalWhisperSttProvider.ts`、`src/tools/whisper-server/server.js`、`voiceProviderManifest.ts` | 自带 whisper-server 改成实现 v1 合同，作为第一个提供者 |
| 对齐 | `alignmentTask.ts` 的区间形状 | 以后做对齐时沿用这个结构，**本程不做** |
| 候选流程 | `src/annotation/alternativeAnalysis.ts`、`src/ai/autoGlossPreview.ts` | 以后接分词和注释，本程不做 |
| 安全基线 | 已定“AI 请求只从主进程发出”，ADR-0031、ADR-0047 | 模型调用同样走主进程 IPC，渲染进程的 CSP 不变 |

## 4. 合同 v1（硬规定）

**版本**
- 只有一个协议版本号：请求和响应外壳里的 `"jieyu": "1"`。声明文件用 `minJieyuProtocol` 声明自己支持的最低版本。
- 兼容规则：主版本不同就拒绝；次版本之间双方都忽略未知字段，不报错。

**时间**
- 单位是秒（浮点）。**所有时间都相对原始媒体文件的起点**，不相对片段。

**音频**
- 解语负责重采样和转码，转成声明里 `audio.accept` 列表中的一种，模型不用自己猜格式。
- **只用 multipart 上传音频字节**，不传本机文件路径。

**长音频**
- 长度超过声明的 `maxAudioSec` 时，由解语按语段或 VAD 切块，块之间不重叠。
- 每块单独请求。解语把结果平移回原时间轴；切块边界算在解语这边，不归模型管。

**调用方式**
- 同步请求：一块音频对应一个 HTTP 请求和一个响应。
- 取消：主进程 AbortController 断开连接。超时默认 120 秒/块，可以在声明里改，有上限。
- 进度：解语按“第 n/N 块”自己显示。异步任务协议（SSE、job id）不做。

**请求**（`POST {baseUrl}/transcribe`，multipart）
- `audio`：音频文件。
- `request`：JSON，`{ "jieyu":"1", "requestId":"uuid", "capability":"transcribe", "range":{"start":12.0,"end":31.5}, "params":{"language":"nxq","prompt":"…","vocabulary":["…"]} }`

**响应**（JSON）
```json
{ "jieyu":"1", "requestId":"uuid", "status":"ok",
  "model":{"id":"org.example.nxq-asr","version":"3.0.1"},
  "result":{"segments":[{"start":12.0,"end":14.2,"text":"…","confidence":0.82,
     "words":[{"text":"…","start":12.0,"end":12.4,"confidence":0.9}]}]},
  "warnings":[] }
```
- 时间必须落在 `range` 里面，`start ≤ end`；不满足就整块判为 `bad_response`。

**错误码**

| code | 含义 | HTTP 状态 |
|---|---|---|
| `bad_request` | 请求格式不对 | 400 |
| `unauthorized` | 令牌错误或缺失 | 401 |
| `unsupported_capability` | 不支持这种能力 | 404 / 501 |
| `unsupported_language` | 不支持这种语言 | 422 |
| `bad_audio` | 音频读不了 | 422 |
| `too_long` | 音频超过上限 | 413 |
| `timeout` | 模型内部超时 | 504 |
| `cancelled` | 已取消 | 499（解语侧自记） |
| `internal` | 内部错误 | 500 |

- 解语侧另记 `bad_response`（响应没通过校验）和 `unreachable`（连不上）。
- 错误响应体：`{"jieyu":"1","requestId","status":"error","error":{"code","message"}}`

**健康检查**
- `GET {baseUrl}/health` 返回 `{"jieyu":"1","status":"ok","model":{id,version}}`。返回的 id 和版本必须和声明文件一致。

## 5. 安全

1. **回环监听**：解语自带的服务一律 `listen(port, '127.0.0.1')`。
   - 现状：`server.js:330` 是 `server.listen(CONFIG.port, …)`，没指定 host，会监听所有网卡。这个问题**由解语修bug 单独修**，不在本方案的单子里。
   - 用户自己的服务，在文档和 conformance 脚本里要求回环监听，脚本检测到非回环就给警告。
2. **一次性令牌**：导入模型时解语生成一个随机 bearer token，存进 OS 钥匙串，用户把它配给自己的服务（服务从环境变量读）。声明文件里不放令牌。每次请求都带 `Authorization: Bearer …`。
3. **Host 校验**：协议要求服务端只接受 `Host: 127.0.0.1:<port>` 或 `localhost:<port>`，以防 DNS rebinding。conformance 脚本会测这一项。
4. **回环判定**：主进程按**解析后的 IP** 判断，只连 127.0.0.0/8 和 ::1；`localhost` 解析到非回环地址就拒绝。不跟随重定向。
5. **严格校验响应**：用 zod strict schema 校验；响应体上限默认 8 MB，单块 segments 上限 10 000 条，文本字段长度也有上限。超限一律判 `bad_response`，结果整块丢弃。
6. **远程地址**：本程不开放。
7. **许可证**：声明的 SPDX 许可证含 `NC`（如 `CC-BY-NC-4.0`）时提示“仅限非商用”。

## 6. 声明文件 `jieyu-model.json` v1

```json
{
  "id": "org.example.nxq-asr",
  "name": "纳西语转写 v3",
  "version": "3.0.1",
  "minJieyuProtocol": "1",
  "license": "CC-BY-NC-4.0",
  "authors": ["…"],
  "languages": [{ "iso639_3": "nxq", "glottocode": "naxi1245" }],
  "orthography": { "id": "nxq-ipa-2019", "description": "宽式 IPA", "unicodeNormalization": "NFC" },
  "capabilities": { "transcribe": { "wordTimestamps": true, "maxAudioSec": 600 } },
  "audio": { "accept": [{ "format": "wav-pcm16", "sampleRate": 16000, "channels": 1 }] },
  "transport": { "kind": "http", "baseUrl": "http://127.0.0.1:8765", "timeoutSecPerChunk": 120 }
}
```
- `license`：SPDX 表达式；不是 SPDX 的写 `LicenseRef-…`，同时附上原文链接。
- **id 规则**：用反向域名。导入时 id 相同、版本更高，就当升级，旧版本的 `model_runs` 保留不动；版本相同但声明文件哈希不同，就要求用户确认是否覆盖；版本更低则拒绝，除非用户显式降级。
- **书写系统映射**：`orthography.id` 导入时要映射到项目里已有的书写系统或转写层配置。映射不上，就让用户选一个目标层或新建一层，映射存进 userData。没映射好不能运行。
- 端点路径固定（`/transcribe`、`/health`），不用声明。v1 里那些 `_transport_*_example` 注释键已删掉。

## 7. 来源表 `model_runs`（项目数据）

| 字段 | 说明 |
|---|---|
| `id` | runId |
| `textId` | 所属项目 |
| `modelId` / `modelVersion` / `manifestSha256` | 模型身份 |
| `capability` | 本程固定为 `transcribe` |
| `params` | JSON |
| `mediaId` / `rangeStart` / `rangeEnd` | 输入范围 |
| `startedAt` / `finishedAt` | 起止时间 |
| `status` | `running \| ok \| error \| cancelled` |
| `errorCode` | 失败时的错误码 |
| `chunkCount` | 切了几块 |
| `acceptedCount` / `rejectedCount` / `pendingCount` | 计数 |

- 每条候选带 `modelRunId`。接受后，正式数据的来源记成“人工确认（原：模型 X / runId）”。
- **拒绝的候选只计数，不存正文**，以免 project.sqlite 无限制地膨胀、被带进 JYM。
- 跟着 JYM 一起导出，存档时能看出哪些内容是机器产出的。
- **D14 冻结**：最好在冻结前把这张表（可以是空表）和候选上的 `modelRunId` 字段定进 schema。赶不上就明确写成“冻结后用一次只加不改的迁移加表”，不留“或者复用”的余地。

## 8. 统一的“模型候选”面板

- 按语段列出候选，显示文本、时间、置信度和来源。可以逐条接受或拒绝，也可以“置信度 ≥ 阈值的全部接受”。
- 接受时写进用户在映射里选定的目标层；**不覆盖已有的人工内容**。目标语段已经有文字时，并排显示，由用户选。
- 以后的对齐、分词、注释也用这个组件，分词和注释再接 `alternativeAnalysis`。

## 9. 测试

- **模拟模型**放在 `src/tools/mock-model-server`（Node 写，只做 HTTP），返回固定结果，可以注入延迟、各种错误码、超时、坏 JSON、超大响应、越界时间、错误的 Host 或令牌。
- **conformance 脚本**和模拟模型放同一个包，用户可以拿它自测自己的服务：健康检查、令牌、Host 校验、合同、时间范围、错误码，以及回环监听警告。
- **vitest**：合同 schema、切块和时间平移、回环判定、上限、候选写入后读回、拒绝不碰人工数据、`model_runs` 计数。
- **Electron e2e**（依赖 #284）：配置模拟模型 → 转写一段 → 接受 → 重载后还在。

## 10. 最小首片与单子（挂 #285，试用之后排）

| 单 | 内容 | 量 | 依赖 |
|---|---|---|---|
| N0（前置，已转解语修bug）| whisper-server 改成只监听 127.0.0.1 | XS | — |
| N1 | ADR：只含 transcribe；合同 v1（§4）、安全（§5）、声明文件（§6）、`model_runs` 表形状（§7）、“结果一律是候选” | S | 最好在 D14 冻结前定下表形状 |
| N2 | 主进程 ModelHost：读声明文件、HTTP 传输、令牌存钥匙串、回环判定、zod 校验和上限、切块和平移、超时和中止、IPC、设置页“模型”栏；自带 whisper-server 实现 v1 合同，**即 #303 的第一个实现** | M–L | #276 桌面壳、N1、N0 |
| N3 | 候选面板 + `model_runs` 落库 + 模拟模型 + conformance 脚本 + 1 条 Electron e2e | M–L | N2、#284 |

合计约 **4–5 周**。

**本程不做（以后再说）**：命令行传输；进程内 ONNX（sherpa-onnx / onnxruntime-node）；MCP 传输；安装包附带模型；远程模型地址；对齐、VAD、分词、注释、翻译；训练集导出。

**以后的方向备忘：**
- **命令行**：参照 ELAN，声明里按操作系统分别写命令。用 spawn 起进程，参数用数组，环境变量走白名单。文案上别承诺“哈希没变就安全”：哈希只能覆盖入口文件，Python 依赖照样会变。
- **训练集导出**：首版只出 `manifest.jsonl`（音频切片 + 文本 + 说话人 + 时长），对齐数据另出 TextGrid。说话人授权读项目里已有的说话人和会话元数据；**缺授权记录的说话人默认不导出**，用户可以显式覆盖，覆盖要写日志，并记进数据卡。
- **对齐**：沿用 `AlignmentTaskResult` 的区间形状，但要另做写回、冲突处理和界面，工作量比 v1 估的大。

## 11. 前人做法（链接 2026-10-13 复核过）

| 项目 | 要点 | 许可证 | 链接 |
|---|---|---|---|
| ELAN 识别器 | CMDI 描述 + 按操作系统写的命令行，放 extensions 目录；web 识别器已停用 | ELAN 本身的许可证未核 | 规格 PDF、手册（见 §2）；实例 https://github.com/coxchristopher/xls-r-elan |
| whisper.cpp server | `/inference`、`/load`，默认监听 127.0.0.1 | MIT | https://github.com/ggml-org/whisper.cpp/tree/master/examples/server |
| BAS WebMAUS | 远程对齐，HTTP multipart | 学术免费 | https://clarin.phonetik.uni-muenchen.de/BASWebServices/ |
| MFA | 命令行强制对齐，需要发音词典 | MIT | https://montreal-forced-aligner.readthedocs.io/ |
| MMS（Meta） | 1000 多种语言，适配器微调 | **权重 CC-BY-NC 4.0** | https://huggingface.co/facebook/mms-1b-all |
| Allosaurus | 通用音素识别 | **GPL-3.0，只能作外部程序** | https://github.com/xinjli/allosaurus |
| sherpa-onnx | ASR、VAD 等，没有对齐 | Apache-2.0 | https://github.com/k2-fsa/sherpa-onnx |
| Persephone / Elpis | 小语种自训模型的需求佐证，两个项目都基本停更 | Apache-2.0 | https://github.com/persephone-tools/persephone 、https://github.com/CoEDL/elpis |

## 12. 待用户拍板（精简版）

1. **`model_runs` 是否赶在 D14 冻结前定进 schema？** 建议赶，空表也行。赶不上就冻结后用只加不改的迁移补。
2. **#303 是否改写成“这套接口的第一个实现”**，并且选自带的 whisper-server（已兼容 OpenAI，改成 v1 合同）而不是 whisper.cpp 官方 server？建议是。
3. **首片只做转写**，对齐放到第二个真实模型出现之后。同意吗？
4. **用户自己的服务必须支持令牌**才能接入，还是只给警告？建议必须支持（conformance 脚本里会提供示例代码）。
5. **何时开单**：现在就在 #285 下开 N1–N3 占位，还是等试用结束？

## 13. 结果怎么进标注页和语料库页（已对照 origin/main 核实）

原则：**不造新机制**，接到已有的“先预览、再采纳”、候选取舍和 `provenance` 字段上。

### 13.1 在哪里发起、在哪里审（首片 N3）

- **转写页发起，不在标注页发起。** 转写文字住在转写层的语段上，标注页（`src/pages/AnnotationPage.tsx` / `AnnotationWorkspace.tsx`）处理的是由这些文字切出的词元。本机 Whisper 现有入口也在转写页（`src/hooks/transcription/useTranscriptionVoiceTranslationActions.ts:460` `loadLocalWhisperConfig()`），N3 在同一处换成走 ModelHost。
- 范围：**当前语段 / 选中的几个语段 / 当前媒体全部空语段**三档。批量跨文件放以后。
- 审：§8 候选面板做成“预览 → 采纳”，形状照抄 B4e AutoGloss（`src/ai/autoGlossPreview.ts` `previewAutoGlossMatches` → `src/pages/annotation/applyAnnotationAutoGloss.ts`）和 B4f/B4g 二次分词（`src/pages/annotation/annotationRetokenize.ts` `previewAnnotationRetokenize`，`useAnnotationRetokenizeController.ts`）：先算出预览，用户勾选，再一次性写入。
- **待审候选不落库**（同 AutoGloss 预览）；面板关掉即丢，`model_runs.pendingCount` 归零、记为放弃。这样首片不用新表存候选正文（指候选正文；`model_runs` 表本身照 §7 新增，每次运行一行，用户 2026-10-13 21:14 确认）。

### 13.2 接受后写到哪里、怎么往下游走（首片 N3）

- 只写进用户选的目标转写层的语段文字；**语段已有文字时不覆盖**，并排显示由用户选（同 §8）。
- 来源直接用已有的 `provenance`（`src/db/schemas.ts:105`）：`actorType:'ai'`、`model`/`modelVersion`、`confidence`、`params.modelRunId`、`reviewStatus`（已有枚举 `draft|suggested|confirmed|rejected`，`schemas.ts:81`）。**语段上不加新字段**，`params.modelRunId` 指向 `model_runs` 的那一行（每次运行一行，§7）。
  - 逐条接受 → `reviewStatus:'confirmed'`，记 `reviewedAt`。
  - “置信度 ≥ 阈值全部接受” → `reviewStatus:'suggested'`，即“机器生成·未确认”。
- 写完发 `WORKSPACE_UNIT_UPDATED_EVENT`（`src/utils/workspaceEvents`，订阅方 `src/hooks/useWorkspaceEventRefresh.ts`），标注页和侧栏照现有逻辑刷新；有未存草稿时走已有的 `onUnitRefreshBlocked`。
- 标注页词元：语段原来为空 → 正常切词。语段已有人工词元 → 不自动重切，交给 B4f/B4g 二次分词的候选和快照流程（`annotationTokenHasManualWork`、`buildRetokenizeCandidateGraph`），已有 gloss 不丢。

### 13.3 来源显示（首片 N3 只做最小一处）

- 转写页语段列表（`src/components/SidePaneSidebarSegmentList.tsx`）上对 `provenance.actorType==='ai' && reviewStatus==='suggested'` 显示“机器·未确认”小徽标，悬停显示模型名、版本、runId；点一下“确认”改成 `confirmed`。
- 标注页、词元级徽标放以后。

### 13.4 语料库页（下一程，不进首片）

- 语料库页（`src/pages/CorpusLibraryPage.tsx`、`CorpusLibraryWorkspace.tsx`）在试用里被 `corpusLibraryPageEnabled=false`（`src/ai/config/featureFlags.ts`）关着，按 #265 隐藏，所以这部分整体放下一程，和 #299 标准格式、#298 语料库 AI 一起排：
  - 现有只有文本筛选框（`CorpusLibraryWorkspace.tsx:174`），加一个“来源：全部 / 人工 / 机器已确认 / 机器未确认”筛选，数据全部来自 `provenance`，不需要新表。
  - 统计分开数“人工”和“机器未确认”的语段数和时长。
  - 导出（EAF 等，#299）默认带上来源；可选“不导出未确认的机器内容”。
- 首片只要保证 `provenance` 写对，下一程不用迁移。

### 13.5 以后的能力接到哪条标注页流程

| 能力 | 接到哪里 | 时间 |
|---|---|---|
| 切分（VAD） | 转写页建语段，走现有 Silero VAD 建段流程，候选段落先预览 | 以后 |
| 对齐 | 转写页语段→词级时间，沿用 `AlignmentTaskResult` 区间形状；写回和冲突另做 | 以后 |
| 分词 / 切语素 | 标注页 B4f/B4g 二次分词候选 + 快照（`annotationRetokenize.ts`） | 以后 |
| 注释（gloss / 词性） | 标注页 B4e AutoGloss 预览采纳 + B4p 候选取舍（`src/annotation/alternativeAnalysis.ts` `listAlternativeAnalysisChoices` / `selectAlternativeAnalysis`） | 以后 |
| 翻译候选 | 转写页翻译层，同 13.1 预览采纳 | 以后 |

### 13.6 首片 vs 以后（一览）

- **N3 首片**：转写页发起（单段/多段/当前媒体空段）、预览采纳面板、写入目标层不覆盖、`provenance` 记 `modelRunId` 和 `reviewStatus`、发工作区事件、语段列表“机器·未确认”徽标 + 一键确认。
- **以后**：跨文件批量、待审候选持久化、标注页/词元级徽标、语料库页筛选/统计/导出（下一程，随 #299）、对齐/切分/分词/注释/翻译。
