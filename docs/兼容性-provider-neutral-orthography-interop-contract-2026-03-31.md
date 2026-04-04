# 兼容性：provider-neutral orthography interop contract

## 目标

把当前已经编码落地的 EAF / TextGrid / plain-text downgrade 行为整理为统一的、可引用的 provider-neutral 合同，避免未来新增外部 provider、导出器或桥接格式时再次各写一套 metadata 规则。

本合同只定义“跨 provider 可稳定保留什么、允许降级什么、未知字段怎么处理”，不重新定义 EAF 或 TextGrid 各自的格式细节。

## 适用范围

- Jieyu 内部 layer/orthography 语义向外部格式导出时的 identity 附带信息
- 外部格式回导入 Jieyu 时的 metadata 解析与稳定降级
- 未来新增 provider / exporter / importer 时可直接复用的最小公共字段

当前已落地的主要入口：

- [src/utils/orthographyInteropMetadata.ts](src/utils/orthographyInteropMetadata.ts)
- [src/services/EafService.ts](src/services/EafService.ts)
- [src/services/TextGridService.ts](src/services/TextGridService.ts)

## Provider-Neutral 字段

允许跨 provider 透传的 metadata 只包含以下字段：

| 字段 | 含义 | 说明 |
| --- | --- | --- |
| `languageId` | 语言标识 | 通常为 ISO 639-3；用于语言身份回放 |
| `orthographyId` | Jieyu 正字法 ID | 如果外部格式无法稳定保留，则允许降级丢失 |
| `scriptTag` | 脚本快照 | BCP 47 script subtag，如 `Arab` / `Latn` |
| `regionTag` | 地区快照 | 可选；例如 `EG` |
| `variantTag` | 变体快照 | 可选；例如 `fonipa` |
| `bridgeId` | 来源/目标桥接规则标识 | 当前只做透传，不要求所有 exporter 都必须写出；旧 `transformId` 已退出现行合同 |

对应代码门禁：

- 构建白名单：[src/utils/orthographyInteropMetadata.ts](src/utils/orthographyInteropMetadata.ts#L13)
- 解析白名单：[src/utils/orthographyInteropMetadata.ts](src/utils/orthographyInteropMetadata.ts#L29)
- 白名单单测：[src/utils/orthographyInteropMetadata.test.ts](src/utils/orthographyInteropMetadata.test.ts)

## 降级规则

### EAF

- metadata 通过 `HEADER > PROPERTY` 写入，key 形如 `jieyu:layer-meta:<TIER_ID>`
- 若 metadata 可解析，则回填到 `tierMetadata`
- 若 property JSON 中出现未知字段，导入时必须忽略，不得抛错阻断导入
- tier identity 仍允许同时保留 EAF 原生 tier 信息，例如 `tierId`、constraint、locale label；这些属于 EAF 专有层，不属于 provider-neutral 合同本体

代码入口：

- 导出注册 metadata：[src/services/EafService.ts](src/services/EafService.ts#L223)
- 导入解析 metadata：[src/services/EafService.ts](src/services/EafService.ts#L679)

### TextGrid

- metadata 通过 tier name suffix 写入，marker 固定为 `__jieyu_meta_`
- tier 名展示部分与 metadata 部分必须可拆分；导入后 UI 只使用原 tier 名，不显示 suffix
- 若 suffix 内 JSON 含未知字段，导入时必须稳定忽略
- TextGrid 不提供结构化扩展位，因此 metadata 只能视为“最佳努力保留路径”，不是强保证

代码入口：

- 编码 tier 名：[src/services/TextGridService.ts](src/services/TextGridService.ts#L48)
- 解码 tier 名：[src/services/TextGridService.ts](src/services/TextGridService.ts#L53)
- round-trip / downgrade 测试：[src/services/TextGridService.test.ts](src/services/TextGridService.test.ts#L66)

### Plain-Text 导出族

- TRS / FLEx / Toolbox / TextGrid plain-text 内容本身不承载完整 orthography metadata
- 这些格式当前只保证 bidi isolate 的 plain-text 安全导出/导入，不承诺 orthography identity 完整回放
- 若未来某 provider 需要附带 orthography identity，必须优先复用本合同字段，而不是新增一套专有键名

## 兼容性原则

### 1. 只增不破

- 新 provider 如果要扩展 metadata，优先新增外层 provider 专有容器，不直接污染 provider-neutral 白名单
- provider-neutral 白名单新增字段前，必须先说明 downgrade 行为和旧版本忽略策略

### 2. 未知字段稳定忽略

- 导入端必须容忍未知字段
- 未知字段不能导致导入失败，也不能污染业务层状态
- 当前实现中，未知字段会在解析 helper 层被直接丢弃

### 3. 业务域不消费 tier-specialized 细节

- 业务域继续 layer-first
- tier / tierId / TextGrid suffix / EAF PROPERTY key 均属于互操作层实现细节
- 业务层若需要 orthography identity，只能拿解析后的 provider-neutral metadata 结果，不直接耦合某个导出格式的编码细节

## 当前已验证行为

- TextGrid round-trip 保留 `languageId / orthographyId / scriptTag / regionTag / variantTag`：[src/services/TextGridService.test.ts](src/services/TextGridService.test.ts#L66)
- TextGrid import 对未知 metadata 字段做 downgrade 忽略，同时保留 `bridgeId`：[src/services/TextGridService.test.ts](src/services/TextGridService.test.ts#L111)
- 快照导入会忽略已移除的旧 `transformId` 兼容字段：[src/db/importDatabaseFromJson.test.ts](src/db/importDatabaseFromJson.test.ts)
- metadata helper 只解析白名单字段并丢弃未知键：[src/utils/orthographyInteropMetadata.test.ts](src/utils/orthographyInteropMetadata.test.ts)

## 对未来 provider 的要求

新增 provider / importer / exporter 时，至少满足：

1. 若要携带 orthography identity，优先复用本合同字段集合。
2. 若 provider 无法保留全部字段，必须在文档中写明 downgrade 路径，而不是静默假装保真。
3. 导入端必须对未知字段稳定忽略。
4. 不得让业务层直接解析 provider 专有 metadata 原文。

## 非目标

- 不承诺所有外部格式都能完整 round-trip `orthographyId`
- 不把 provider-neutral 合同扩展成“所有 interop 结构字段总表”
- 不在本轮引入新的外部 provider 实现

## 结论

当前 Jieyu 已经具备：

- EAF 的结构化 metadata 保留路径
- TextGrid 的编码 suffix 保留路径
- 导入端未知字段稳定忽略降级
- provider-neutral 最小字段白名单

剩余工作不在合同定义本身，而在未来新增 provider 时严格复用这一合同，而不是回到“每个导出器单独发明 metadata 规则”的旧路径。