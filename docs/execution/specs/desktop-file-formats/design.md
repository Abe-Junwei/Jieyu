---
title: 文件事务、导入导出与格式损失矩阵
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-file-formats-spec
depends_on:
  - ../../../adr/0100-desktop-engineering-contract.md
---

# 文件与格式（技术审阅稿）

正式依据：[EAF3 XSD](https://www.mpi.nl/tools/elan/EAFv3.0.xsd)、[Praat TextGrid](https://www.fon.hum.uva.nl/praat/manual/TextGrid_file_formats.html)、[DMLex1](https://docs.oasis-open.org/lexidma/dmlex/v1.0/os/dmlex-v1.0-OS.html)、[LIFT0.13](https://github.com/sillsdev/lift-standard)、[gb4e](https://ctan.org/pkg/gb4e)。复用现有各serializer，但以下是目标合同，不是函数当前已满足。

## 共用预览及报告

ExportPlan=`{planId,format,version,snapshotRevision,selectedObjects,languageChoices,timeAxis,mediaPolicy,mapping,losses,excludedDrafts,excludedPending,counts,digest}`。loss逐项包含对象/字段/关系、原值类型、处理`preserved|transformed|omitted|blocked`、原因及数量，预览可以展开到具体对象。确认绑定plan摘要；确认后数据改变须仍读原snapshot或重新预览，不能把确认用于不同内容。

ExportReport包含plan、实际写入数、损失数、校验结果、格式/应用版本、文件哈希/大小、完成状态和生成时刻；报告自己不带密钥/技术日志。单文件可旁置`.report.json`，失败不把旧文件旁的旧报告当本次成功；文件与报告先生成到临时位置并校验；报告及可选媒体放不可变generation目录，先完整发布并pin住，再把成果主文件作为最后可见提交点整体替换。报告记录主文件hash，发布回执返回准确generation/planId/报告路径，核同hash确认对应；同内容不同plan的报告不能仅按hash任挑一份；不覆盖旧generation，主文件发布失败仅留待清理孤儿，新旧报告不串用。不能仅把manifest最后写入就宣称旧文件已受保护，普通外部工具也不能被迫依赖专有manifest才能读主文件。

## 字段与关系投影矩阵

P=保留声明范围；T=明确转换；L=损失须确认；B=不能生成合法目标、必须先解决。下表每行均须测试，不是按格式名称统称无损。

| 字段/关系 | EAF3 | TextGrid长文本 | gb4e .tex | DMLex JSON | LIFT0.13 |
| --- | --- | --- | --- | --- | --- |
| 区间原文/毫秒时间 | P，选定时间轴 | T秒十进制，独立IntervalTier | T原文，无时间 | 不属词典输出 | 不属词典输出 |
| 点事件 | L/B：不伪造零时长对齐层 | P独立TextTier | L | — | — |
| 说话人/层 | P PARTICIPANT/层 | T按层/说话人独立tier，名称映射列报告 | 选显式说话人标签，其余L | 例句来源按标准字段T | 例句来源文本T |
| 译文多语言 | P独立语言层，LANG_REF准确 | T每语言独立tier | T用户选定译文，不静默取首项 | P标准多语结构 | P声明支持的form lang |
| 词/语素/gloss | P可表达的符号父子链；多宿主L/B | L结构；可选投影独立层，不称原图 | T按词列和语素边界；gloss语言明确 | 词典自身结构P，不带语料图 | 词典义项/例句投影T |
| 零语素/`=`/不连续/跨词 | 无合法唯一父宿主映射则L/B，不能乱加属性 | L结构，只输出选择的文字 | T显式零形式`∅`、`=`；复杂非连续无可靠排版则B或用户明确省略 | 语料分析不在范围 | 语料分析不在范围 |
| 义项身份/词典绑定 | L应用关系；禁止非标准JIEYU_LEXEME_ID属性 | L | L | P标准entry/sense id；语料绑定L | T entry/sense id，外部身份往返核映射；语料绑定L |
| 词头/全部义项/释义 | — | — | 非词典格式 | P标准结构 | P已声明子集；其余L |
| 词类/标签/发音/屈折 | — | — | 选定gloss文字T | P标准数组与受控定义 | T当前首项截取不能算P；未实现多项列L |
| 词源/关系/资源受控表 | — | — | L | P标准允许部分，全部顶层必须枚举 | T/L，subsense可投嵌套，其他不静默丢 |
| 例句文本/译文/来源 | — | — | T选择内容 | P标准字段；应用定位/版本快照L | P/T声明子集，应用定位L |
| 自定义字段/备注扩展 | L无标准映射 | L | L或用户选定文字注释 | L应用扩展，不侵入标准命名空间 | 仅标准合法映射且实测的保留，否则L |
| 历史/草稿/AI建议/删除记录 | L/排除，报告明示 | L/排除 | L/排除 | L/排除 | L/排除 |
| 媒体字节 | 引用/可选副本T，不在XML内 | 独立音频T | 不含 | 标准soundFile引用T | 标准媒体引用T |

EAF符号链只用合法schema属性；无同层时间的零语素不硬造时间段，合法引用细分是否可表达须具体profile验；不能因profile可表达一例就宣称复杂图全支持。TextGrid区间层补空隙只为格式序列，重新导入时区分空隙和真实空文本标注；无标准区别时报告歧义并让用户选择，不默吞真实空段。

DMLex完整标准字段按vendored JSON schema枚举资源/entry/sense及受控表；当前`dmlexJsonExport.ts`只挑部分顶层，须修正或列未支持，不靠entry JSON完整掩盖资源损失。LIFT当前仅首个POS/发音/词源和subsense投影；首发profile明确支持全部选定子集，其他预览损失。FLEx打开保存后再导回，不能用Jieyu自身XML解析器代替外部工具证据。

## 文件发布、快照与容量

现有fflate小包序列化可保留，但其项目路径zipSync/unzipSync与32MiB上限不能满足50GB；不能只改上限。推荐包读写适配[yazl](https://github.com/thejoshwolfe/yazl)写ZIP64流与[yauzl](https://github.com/thejoshwolfe/yauzl)按中央目录惰性读取条目流，不整包进内存。官方均声明ZIP64支持，yauzl不是盲读local-header的单向流解析；两者MIT、纯Node接口、无Electron原生ABI构建，需锁版本审传递依赖及打包体积，实际字节/吞吐尚未测。现有依赖fflate不满足大文件写入合同才采用此新增候选，不随文档安装。超过4GB单项、50GB包、65,535+条目、伪造大小/偏移必须实测；不依赖系统归档工具兼容ZIP64，产品恢复用自己的受控读取器。

备份步骤：保存→在文件生命周期协调临界区先阻止新的垃圾箱/移走调用并等在途调用明确→SQLite一致快照及其媒体/附件清单→原子登记该清单snapshot pin后才恢复其他文件清理准入→流式复制并算hash→验证manifest/文件→发布新包→成功后轮换旧包。不锁编辑到50GB复制结束，但文件清除必须尊重snapshot pin。快照到pin之间不能存在媒体可被移走的空隙；无法确认在途移走结果则备份不启动，不把缺失文件直接跳过后称完整。断电遗留临时文件下次列为可清理，不按目标文件缺失猜成功。

目标检查复用exportSafety：项目库、日志、正在使用媒体/附件/来源文件及别名/hardlink不能成为成果覆盖目标。覆盖确认后同目录独占临时文件，完成写入、flush/close、哈希/结构校验再替换；替换前保存并校验旧目标恢复副本，直到发布结果确认后才可清理；替换调用后回执/flush失败属结果未知，核目标与新旧hash，不谎称旧路径仍原样。未知期间保新旧generation与恢复副本、禁止盲重发，平台文件原语在Mac/Windows分别验证。非原子跨文件系统复制不叫原子替换。

## 导入与共享依赖

ImportPlan=`{inputHash,format,sourceBytes,roles,mediaBindings,sharedObjectMap,perManuscriptLosses,conflicts}`。原件内容哈希保留，path只作本机定位；zip校验包含展开字节预算、项数、相对路径、symlink、重复项和哈希，不能用移除32MiB限制同时取消压缩炸弹保护。预算超限说明具体资源并拒绝，不吞内容。

逐稿事务之前媒体字节先写私有staging、校验；首次成功稿发布所需依赖。DB与文件不假装同事务：用已有附件publish/cleanup阶段模式，文件发布失败不提交引用，DB失败清理本次未共享字节；清理未知保可处理记录。取消在单稿事务边界观察，已成功稿不回滚；共享对象一经成功稿引用不删。

重复外部文件只取消/独立新稿，不更新原稿；同名不作身份。映射不明关键关系B，未支持数据保原件并注明不可查编辑，丢弃需确认。原件保留不等于重新导出已无损。

## 草稿恢复、重定位与新录音迁移

恢复文件专用mimetype/载荷版本，含项目身份、目标复合身份、基准修订、rawInput和必要定义依赖；无密钥。导入仅原项目或明确映射的副本，逐项对照基准与当前，全部解决后一次提交，不能把它当完整项目包。另存成功不删除原内存草稿。

重定位SHA-256一致才能当同一文件；哈希读取流式、有进度可取消，文件处理中变化须重新核。无法确认不能放宽成同名/同长。新录音迁移创建新稿新id，原引用不动，时间全待核对；越界/点冲突先解决，语言分析资格按实际依赖保留，时间查询/截音默认排除暂定时间。

## 外部验证记录

EAF：官方XSD校验→ELAN导入/保存→Jieyu重导。TextGrid：Praat读取/保存区间及点、多说话人分层→重导。DMLex：正式schema＋独立读取器重编码/读取→重导，记录工具版本；LIFT：FLEx导入/导出→重导。LaTeX：XeLaTeX/LuaLaTeX之一完整wrapper实际编译，Charis SIL与IPA/附标、零语素/`=`/空gloss/长词排版检查；不反向导入出版文件。

每种报告具体支持profile、保留字段比较、允许变换、真实损失和被阻止例。包含精度变更、层改名、外部新增身份、无媒体、空文本、已删除数据和自定义字段。测试路径见verification，未实测保留未通过。

审查反例：快照产生后并发清理不得在pin前移走媒体；主文件rename成功但目录flush失败→结果未知且旧恢复副本仍在；新报告发布后主文件替换失败→旧主文件和旧报告仍有效；不能用“整组原子”掩盖两个文件分别发布。
