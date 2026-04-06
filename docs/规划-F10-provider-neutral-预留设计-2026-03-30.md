> 文档角色：历史规划文档。仅用于保留当时的方案、约束与决策背景，不再作为当前实现的事实源。当前现状请优先查看 docs/architecture/ 与 README 中的文档索引。

# F10 provider-neutral 预留设计

## 目标

- 先定义统一的对齐任务合同，避免页面层或未来任务编排直接绑定某一个 provider 的返回结构。
- 当前只为后续接入预留统一任务输入/输出，不承诺近期交付通用强制对齐产品能力。

## 当前结论

- 统一请求结构使用 AlignmentTaskRequest。
- 统一结果结构使用 AlignmentTaskResult。
- provider 适配层当前提供 WebMAUS -> provider-neutral 的最小转换函数。
- 页面层和 AI 编排层后续如需接入，只依赖 provider-neutral 合同，不直接消费 WebMAUS 专有结果。

## 暂不做

- 不新增转写页 UI 入口。
- 不新增任务队列或 provider 配置页。
- 不承诺 WhisperX/MFA/WebMAUS 的跨语言通用可用性。

## 下一步

1. 若后续确实启动 F10，把任务持久化字段与 ai_tasks 对齐。
2. 在 provider 适配层补进度、取消、失败分类。
3. 在接入前先完成语言资源约束与隐私/授权清单。