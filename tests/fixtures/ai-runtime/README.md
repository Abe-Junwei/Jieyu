# R1 fixture 录制说明

用途：为 ToolLoopAgent 试点（迁移方案 v4.2 R1）提供真实 SSE 回放样本。盒子上只回放，不联网。

## 运行（在 Mac 的项目根目录）

```bash
DEEPSEEK_API_KEY=... DASHSCOPE_API_KEY=... MINIMAX_API_KEY=... ANTHROPIC_API_KEY=... \
  node scripts/record-ai-fixtures.mjs
```

- 只录部分：在命令末尾加配置名，如 `node scripts/record-ai-fixtures.mjs deepseek-chat anthropic`。
- 可选环境变量：`QWEN_MODEL`（默认 `qwen-plus`）、`MINIMAX_BASE_URL`、`MINIMAX_MODEL`、`ANTHROPIC_MODEL`。
- 共 6 个配置（deepseek-chat、deepseek-reasoner、qwen-thinking-on、qwen-thinking-off、minimax、anthropic）× 3 个场景（approve 批准、reject 拒绝、interrupt 中途中断），输出到本目录 `<配置>.<场景>.json`。

## 安全
- key 只从环境变量读取，不写入任何文件；请求头（含 Authorization / x-api-key）不保存。
- 输出前把 key 原文和 `sk-…` 形式的串替换为 `[REDACTED_KEY]`。
- 提示词是固定的合成样例，不含用户语料。提交前请再 `grep -r "sk-" tests/fixtures/ai-runtime` 确认为空。
