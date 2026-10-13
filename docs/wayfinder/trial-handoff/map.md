---
label: wayfinder:map
issue: https://github.com/Abe-Junwei/Jieyu/issues/250
---

# 地图：解语交给语言学者试用

## Destination

解语可以交给不懂开发的语言学者试用：在自己电脑上双击就能用浏览器打开、自己上手、靠互传项目包协作。到达时所有试用前需要拍板的问题都已定，剩下的只是去做。

## Notes

- 追踪方式：本目录 Markdown（约定见 [README](README.md)）。
- 已定（用户 2026-10-13）：
  - 分发：在试用者自己电脑上本地运行，用浏览器打开本地网址，不设服务器（用户 18:54–18:55 改定，取代此前的桌面安装包）。Mac 与 Windows 都要能跑。
  - 协作：只靠互传项目包 JYM/JYT，不做实时同步。
  - AI：试用者自己填云端模型 API 密钥（DeepSeek、Qwen 等），不附带本地模型。
  - 按 D14，交给非开发者即 schema 冻结点，冻结在这条路上。
- 背景：AI SDK 迁移由「解语修bug」在 `feat/ai-runtime-r1-toolloop` 进行（方案 v4.2）；三个已评审修复待合：`fix/p1-2-undo-collab`、`fix/p2-3-adapter-indexed`、`fix/ws8x1-e2e-region-wait`。评审报告在盒子 `/workspace/jieyu-review/`。
- 默认只做决策，不做实现。代码改动遵守 ponytail 原则。

## Decisions so far

<!-- 每张关闭的单子一行 -->

## Not yet specified

- 发布流水线：启动方式定了之后，CI 如何出 Mac/Windows 可用的发布包、版本号与 release-gates 如何衔接。
- 多台电脑/多浏览器：同一试用者换设备时数据怎么走。
- 冻结之后的迁移演练：试用期间若必须改结构，升级路径如何验证。
- 试用者隐私与伦理：录音数据不出本机的承诺怎么写（与崩溃上报、AI 调用相关）。
- 性能底线：试用者常见电脑上的大录音/长项目表现。
- 试用结束后的去向：数据保留与转正式版。

## Out of scope

- 实时同步 / Supabase 云协作：用户已定只靠项目包互传。
- 附带或推荐本地模型（WebLLM、Ollama）：用户已定用自填云端密钥。
- 桌面外壳与安装包（Tauri/Electron）、签名公证、桌面自动更新：用户改为本地运行、浏览器打开。若本地启动器需要签名，再按「本地启动方式」的结论重开「签名与公证」。已关闭：桌面外壳选型、外壳可行性调研、签名与公证、桌面升级四张单子。
- 远程托管网站、域名、国内访问与备案：用户明确不设服务器。
- 移动端。
