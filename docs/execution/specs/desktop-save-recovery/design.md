---
title: 保存回执、草稿、撤销及窗口协调规格
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-save-recovery-spec
depends_on:
  - ../../../adr/0100-desktop-engineering-contract.md
---

# 保存与会话协议（目标接口，尚未实现）

复用ADR-0085单库事务、ADR-0091字段修订与诊断补交；不跨对话框持数据库事务，不把renderer回执当真值。下列存储字段是下一次格式设计输入，不是授权改schema或迁移用户库。

## 业务写入与回执

请求封套`{operationId,projectSessionEpoch,attempt,kind,targetRefs,expectedRevisions,payload}`，operationId由宿主签发/登记，重试不换id；下一版新编辑另取id。主进程规范化后计算digest（kind＋完整身份＋预期修订＋载荷），相同id不同digest报OPERATION_ID_CONFLICT。日志不记录payload正文。

项目内回执`{operationId,digest,kind,status:committed,commitRevision,resultRefs,fieldRevisions,committedAt}`与业务数据、必要来源/补交依据同事务提交。失败回滚不伪造committed回执。读回接口`operations.inspect(operationId,digest)`返回`committed(result)|not-submitted|unknown(reason)`；只有所属执行任务已结束且数据库可可靠读取、无committed记录时才可判not-submitted，IPC断连本身不是证据。inspect判未提交前须在宿主调度临界区排空该operation，并提升attempt栅栏，使旧传输副本即使迟到也不能执行；返回绑定digest/epoch的新attempt一次性重试许可。重启作废旧epoch，不能仅查“表中没有回执”就允许旧请求与新请求竞跑。

重复committed请求只返回原结果，不重放副作用；自动保存A未知期间可以继续编辑内存B，但B不得排进同对象事务。inspect确认A成功后更新成功基线，再提交最新B；确认未提交则可用原A封套重试，但有更新B时优先封存未执行A并给最新B新id，不先重放过时A。原A再发送必须被attempt栅栏拒绝，不能改A载荷冒充同一请求。

重试起始计划为失败后1s、2s、4s共3次，仅确认未提交且属于瞬时错误可自动重试；校验、权限、格式、不存在目标、冲突和损坏均不自动重试。退避中有新输入保留最新草稿；原操作未执行时可取消原排队条目并创建新操作。显示失败直到最新版本成功，所有时间用单调时钟排程，系统时钟变动不连发。

回执首发不按时间自动清理，防止迟到客户端重放旧操作；体积计入历史/容量验收。项目复制按包模式映射身份，但旧回执只作历史，不给新会话执行权限。技术日志pending按既有交付id补交，不重写研究内容。外部副作用不能仅靠数据库回执认成功，文件发布另走files协议。

## 草稿载体及保存状态

草稿`{draftId,targetRef,fieldSet,baseFieldRevisions,rawInput,parsedPatch?,validationIssues,updatedAt,kind:edit|definition-change|review}`存项目，与正式值分离；rawInput可容纳`00:01:`而不写非法时间。操作id及所需版本属于草稿恢复资料，不写Key/运行时指针。

同一窗口会话同一目标字段最多一个活跃草稿，其他域仅通过协调接入；业务批量操作不直接覆盖草稿。合法普通patch在事务中校验并发布，成功同事务删除对应已提交草稿；不合法则只保存草稿。不要先删草稿再试正式写入。已保存草稿再次编辑后显示有未保存变更，旧草稿在盘上不等于当前输入已保存。

UI分别读`persistence=dirty|queued|writing|saved|failed|unknown`和`publication=active|inactive-draft|conflict`；不把saved和active合并。项目保存汇总：任一unknown优先、其次failed、writing/dirty，全部最新输入持久才saved；另显示尚未生效草稿数。队列timer不负责改变数据库资格。

500ms从最后输入计时；5s从最早尚未入队的未保存输入计时，只在对应版本入队后推进基线，不能每次按键/重排timer都重置上限，不从组件重挂载重置；IME compositionstart暂停提交该字段，compositionend重建最新patch并flush到已到期队列。原文合法变化每次仍执行失效/历史事务，不以合并队列跳过首个有效分析历史。

## 离开、放弃和退出

离开意图先冻结本次目标导航，收集涉及的对象/字段，结束IME后flush，等回执明确。成功执行原导航一次；失败显示留下/重试/明确放弃，不能用户点两次就双重离开。草稿持久且未生效允许离开，但内存比盘上新仍须处理。

放弃前不取消已经在事务中的写入假装回滚，先inspect所有在途结果；已提交内容保留。只移除尚未提交输入/草稿patch并回到最后成功基线；对本来合法但未生效的持久草稿明确放弃时以独立事务删除草稿。unknown不能安全放弃时提示先核实/安全重开，另存抢救不自动满足原项目保存。

close/reopen/切项目均有宿主退出协调，不能仅靠renderer beforeunload。顺序：进入closing阻新普通工作→取消现有查询并确认停/解除查询锁→等待IME结束→以closing专用许可保存输入→停止AI/文件任务并以同许可保存已生成候选→完成并核实必需事务→关闭全部写连接→释放写者锁。closing只允许本次协调token登记的flush/核实/任务收尾，不误拒这些必要写入；查取消失败不能继续保存或释放占用。失败恢复可安全恢复的准入，已经成功保存/停止的效果不倒退，不暗排离开。

## 撤销与历史记录

内存UndoEntry=`{operationId,groupId,targets,changedFields,before,after,expectedAfterRevisions,inverse,linkedHistoryIds}`；redo记录另有预期撤销后修订。合并输入组只合并可连续同字段输入，不跨IME、粘贴、导航或结构操作；debounce不是撤销边界。

跨对象操作在各对象栈引用同一Entry。undo检查全部受影响对象后续栈位置和字段修订，全部通过才逆操作一次事务；redo同理，不能重跑原AI或导入器。新编辑清理其对象的redo，并同步使共享Entry的redo不可用，其他对象不残留可点击假重做。堆栈仅本会话，当前版本/历史另持久。

## 单写者与只读会话

宿主协调`{projectIdentity,writerOwner,sessionEpoch,commitRevision,queryLease,closing}`。projectIdentity由规范路径及文件身份确定，别名路径/符号链接不能绕占用；进程占用核OS存活及持有身份，不能仅过期时间强解锁。writer是一个协调主体，不是让两个进程各自认为自己持有同一锁。

只读窗口读只读连接或宿主只读快照接口，成功提交广播revision，界面整体切换；加载中再次更新仅发布完整最新版本，不让旧异步返回覆新。独立第二进程若无法连原宿主协调，只能报占用，不能擅自直接进入会自动刷新的“半只读”模式；通过owner转交只读窗口或失败返回。

关闭编辑窗口不等于销毁项目协调宿主：仍有只读窗口时宿主保留其只读会话并释放编辑者资格；最终关宿主才关全部连接。写者关闭时让只读窗口保留最后一致数据，不授权限；申请编辑重新取得写锁，升epoch并重新加载，旧执行/审批凭据全部无效。只读查询统一走宿主准入，协议见专业查询execution；不同项目不共用该锁。持久草稿载体也受全项目查询写锁。

## AI协议及诊断最小集

候选记录`{suggestionId,taskId,targetRef,inputDependencyRevisions,model,provider,createdAt,body,editedBody?,reviewState,provenance}`，提交`{suggestionIds,expectedTargetRevisions,chosenPatches}`。依赖变化项过期，批次任一冲突整笔不写；重新对应生成当前版本的人工操作，不修改旧生成凭据以伪称原任务有效。

运行合并键为目标复合身份＋类型＋输入digest＋配置digest＋provider/model，不包含密钥；未知云结果不以取消本地等同远端已停。query锁时候选仅内存，限额达到显示暂停/拒收未保存新候选，绝不绕锁落盘；不丢已有候选并假称全部完成。

诊断封套仅operationId/taskId、时刻、版本、错误代码、阶段和技术计量；路径/项目名默认脱敏，研究正文与凭据禁止。恢复副本不复活任务/清除执行资格；项目中的来源与接受事实按领域数据保留，不能当技术日志清掉。

审查反例：A提交回执丢失且旧请求晚到→inspect/attempt栅栏后只允许一次提交；A未提交而B已输入→重试最新B；查询持锁时关闭→先确认取消再flush；关闭编辑窗口但只读仍开→协调宿主不消失。这些是实现必须新增的故障断言，非已运行结果。
