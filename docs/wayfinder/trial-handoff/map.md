---
label: wayfinder:map
---

# 地图：解语交给语言学者试用

## Destination

解语可以交给不懂开发的语言学者试用：自己装好（Mac/Windows 安装包）、自己上手、靠互传项目包协作。到达时所有试用前需要拍板的问题都已定，剩下的只是去做。

## Notes

- 追踪方式：本目录 Markdown（约定见 [README](README.md)）。
- 已定（用户 2026-10-13）：
  - 分发：Mac 与 Windows 桌面安装包，不提供纯网页地址。
  - 协作：只靠互传项目包 JYM/JYT，不做实时同步。
  - AI：试用者自己填云端模型 API 密钥（DeepSeek、Qwen 等），不附带本地模型。
  - 按 D14，交给非开发者即 schema 冻结点，冻结在这条路上。
- 背景：AI SDK 迁移由「解语修bug」在 `feat/ai-runtime-r1-toolloop` 进行（方案 v4.2）；三个已评审修复待合：`fix/p1-2-undo-collab`、`fix/p2-3-adapter-indexed`、`fix/ws8x1-e2e-region-wait`。评审报告在盒子 `/workspace/jieyu-review/`。
- 默认只做决策，不做实现。代码改动遵守 ponytail 原则。

## Decisions so far

<!-- 每张关闭的单子一行 -->

## Not yet specified

- 发布流水线：桌面外壳定了之后，CI 如何出 Mac/Windows 包、版本号与 release-gates 如何衔接。
- 数据位置与卸载：外壳里数据目录、卸载是否删数据、多台电脑。
- 冻结之后的迁移演练：试用期间若必须改结构，升级路径如何验证。
- 试用者隐私与伦理：录音数据不出本机的承诺怎么写（与崩溃上报、AI 调用相关）。
- 性能底线：试用者常见电脑上的大录音/长项目表现。
- 试用结束后的去向：数据保留与转正式版。

## Out of scope

- 实时同步 / Supabase 云协作：用户已定只靠项目包互传。
- 附带或推荐本地模型（WebLLM、Ollama）：用户已定用自填云端密钥。
- 纯网页部署给试用者：用户已定只发桌面安装包。
- 移动端。
