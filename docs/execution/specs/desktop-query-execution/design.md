---
title: 专业查询执行与正则选型提案
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-query-execution-spec
depends_on:
  - ../desktop-professional-query/design.md
  - ../../../adr/0100-desktop-engineering-contract.md
---

# 执行、资源及正则

## Research 与技术选择

- 沿用 SQLite 权威数据及现有命中定位；不引入 graphANNIS 第二套可写数据。复用索引筛候选，不复用当前子串语义冒充JQ1。
- [RE2](https://github.com/google/re2)给线性匹配与可控资源策略，不支持回溯引用／前后查找；[语法](https://github.com/google/re2/wiki/Syntax)明确Unicode字符类及支持范围，不内置NFC归一化。
- 原生JS RegExp虽已安装于运行时，无法仅靠语法字符串长度排除灾难性回溯；拒作用户正则执行器。仅禁UI线程运行也不能保证预算。
- [node-re2](https://github.com/uhop/node-re2)是原生绑定，需各Electron/OS/CPU构建与ABI验证；[re2-wasm](https://github.com/google/re2-wasm)减少原生ABI成本，但须检查其封装版本、WASM初始化、Unicode和峰值内存。
- 推荐适配RE2语义，首个实现切片优先评估re2-wasm，node-re2备选；不能让候选包装器自身的README等同已通过8GB容量测试。本轮不安装依赖，不伪称已锁包。
- RE2与node-re2为BSD-3-Clause，google re2-wasm封装为Apache-2.0（底层RE2许可仍需随包保留）；实施须核锁定归档LICENSE及传递依赖。实际安装包/WASM字节和冷启动尚未测，不能给虚构KB值；通过打包对比再锁适配器。大包ZIP64候选另见文件格式规格，此处不替包协议选库。

## 正则公开子集

文字、转义元字符、`.`、`[]`及否定类、Unicode `\p{…}`、`()`/`(?:)`、`|`、`? * + {n,m}`、`^ $`；CASEFOLD由条件选项传递；不支持lookaround、backreference、递归、脚本、命名回调、`\X`。锚点针对单字段而非整项目；默认非多行，点不匹配换行，v1不隐式启用m/s/g/y。不支持结构在编译前定位原模式范围，不“修复”为另一模式。语法与Unicode版本写入执行证据。

正则比较在NFC输入上做搜索；需要整值可显式`^(?:...)$`，RE2的匹配offset映回原始文本字素边界，不能把NFC索引直接当持久跨度。模式原样保留，明确NFC输入语义；字符类组合形式不做偷偷替换。

## 准入与生命周期

1. prepare(queryId,queryDocument)：解析→稳定身份绑定→类型／关联连通性→预算→当前会话可用性。任何错误不锁、不用旧AST执行。
2. coordinator进入preparing；拒绝新的普通业务请求，但为本次prepare签发一次性drainToken，仅放行已登记窗口的IME完成、草稿flush及先前事务收尾；通知编辑窗口结束当前组词并flush，不强制提交组词。草稿持久保存、正式版本不合法按ADR保留草稿；失败或用户取消prepare即撤销drainToken、恢复准入，查询不启动。组词期间新请求仍仅属当前输入，最终flush后原子收紧为执行锁，不留flush→取锁的插写空隙。
3. drain所有已准入事务并核实回执未知状态，unknown未解则终止准备并提示；在同一协调临界区撤销drainToken、读取最终revision并赋予唯一lease，记录projectSessionEpoch、snapshotRevision。对用户普通写入口、AI、导入、定义迁移、草稿持久化同一准入检查，不只禁按钮。
4. 启动独立可终止任务，只读打开已核对项目并按一致版本查询；宿主持lease，执行任务不能给自己授写权。其他窗口的查询不排队，返回QUERY_BUSY。
5. 完成／限条／错误→宿主确认执行任务结束，丢弃不匹配queryId/epoch结果→释放lease→允许排队保存候选。执行期间到达的新AI候选仅内存暂存。
6. cancel先协作停止；5s未退出宿主强制终止任务，退出确认才解锁。窗口消失不等于线程退出；宿主故障重开先核旧所有者已停。无法确认保持项目受限，提供安全重开。
7. 查询worker绝不直接操作项目协调或释放锁。进度和完成消息均带queryId/epoch，旧任务消息不得结束新任务或插入新结果。

## 查询计划与完整结果

- 先用等值／目录id／稿件范围索引筛候选，再对局部范围评估关系；绝不先枚举全项目多对象笛卡尔积。AND可重排但不得改变字段依赖／unknown语义；OR去重保留不同匹配绑定。
- 词序用完整序列位置，分析资格只影响谓词，不压缩原位置；关系须同时验证生命周期、字段修订、边界资格。
- 按稿件显示顺序和句段稳定序列扫描；一个命中范围必须枚举完其全部绑定再封闭。跨段同起止范围枚举完后才计一条，不以首次找到就封闭。
- 多层起止范围排序以媒体／文献轴已选范围时间和稳定身份作键，保留关联层。取前N需确定不存在更小未完成范围；无法证明时结果completion=unfinished，不得声称稳定前N。
- 结果`completion=complete|truncated|unfinished`，`freshness=current|stale`；理由`limit|timeout|cancel|resource|error`独立。取消可保留已封闭结果，但明确未完成；失败不展示旧结果为本次新结果。
- 过期判断保存实际依赖（字段／定义修订、范围成员、目录、timeMapping），包括未命中对象新增／变化对结果集合的影响；不只订阅命中行。不能精确判断时项目内容修订变化即过期。

## 资源边界与验证

用户确认的30s/5min及1,000/10,000不变。以下为**实现保护起始值，不是容量实测结论**：查询文本64KiB、对象16个、AST节点512、嵌套32、单模式4KiB、单任务最多8个不同正则、临时结果数据64MiB。解析或资源预算拒绝给准确类别，不静默截条件；正式默认值要由8GB基线校准后写入构建记录，不能擅改产品上限。

超大单范围绑定不因“只占一条结果”无限膨胀，达到资源预算即未完成并解锁；不得把该范围的半份命中称完整结果。正则包装器若无可设内存预算，隔离任务进程上限与全部应用3GB峰值共同验收，不用OOM杀进程代替可解释错误。

固定答案测试含：同对象与不同对象、重复值ANY/ALL、NOT缺失、NFC与附标、零语素、同层词距、跨层重叠、同段合并、重叠跨段范围不串并、OR各分支连通、改回同值的依赖修订、取消晚回、范围新增导致过期。文本↔AST↔构建器按语义等价断言，原文保留另断言。具体测试落位与性能步骤见工程验收规格。

准入反例：有dirty字段时prepare必须能凭drainToken保存，不形成“锁住自己”；flush成功到lease发放之间的普通写必须拒绝；prepare取消撤token后迟到flush不得插入下一次查询。执行与退出的协调token种类分开，不能拿closing许可绕过仍持有的query lease。
