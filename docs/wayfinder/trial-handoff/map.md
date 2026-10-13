---
label: wayfinder:map
issue: https://github.com/Abe-Junwei/Jieyu/issues/250
---

# 地图：解语交给语言学者试用

## Destination

解语可以交给不懂开发的语言学者试用：在 Mac 或 Windows 上装好桌面版就能用、自己上手、靠互传项目包协作。到达时所有试用前需要拍板的问题都已定，剩下的只是去做。

## Notes

- 追踪方式：本目录 Markdown（约定见 [README](README.md)）+ GitHub issue（本图 #250，子单 #251–#278）。
- 全局排期真源是 [主路线图](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/execution/plans/%E8%A7%A3%E8%AF%AD-%E4%B8%BB%E8%B7%AF%E7%BA%BF%E5%9B%BE-master-roadmap-2026-06-01.md)。本图只管「交给试用者」这一程；与主路线图重叠的单子在各自 Related 里链到原条目（C1 对外前最小检查、C2 i18n、batch4a/4b 记录）。主路线图里没有与本图重复的 GitHub issue。
- 已定（用户 2026-10-13）：
  - 分发：桌面外壳（Electron）。19:11 改定，取代 18:54 的「本地运行、浏览器打开」。Mac 与 Windows 都要能跑。
  - 协作：只靠互传项目包 JYM/JYT，不做实时同步。
  - AI：试用者自己填云端模型 API 密钥（DeepSeek、Qwen 等），不附带本地模型。
  - 按 D14，交给非开发者即 schema 冻结点。
- 输入：盒子 `/workspace/jieyu-review/RESEARCH_DISTRIBUTION.md`（本地运行网页应用的同类调研，C 只作对照，#252 补全）。
- 背景：AI SDK 迁移由「解语修bug」在 `feat/ai-runtime-r1-toolloop` 进行；三个已评审修复待合：`fix/p1-2-undo-collab`、`fix/p2-3-adapter-indexed`、`fix/ws8x1-e2e-region-wait`。
- 默认只做决策，不做实现。代码改动遵守 ponytail 原则。

## Decisions so far

- 2026-10-13 19:11 用户：直接走桌面外壳（C）。关闭 [#267](https://github.com/Abe-Junwei/Jieyu/issues/267)、[#268](https://github.com/Abe-Junwei/Jieyu/issues/268)（并入 #252）、[#273](https://github.com/Abe-Junwei/Jieyu/issues/273)（并入 #269）；重开 #251–#254。
- 2026-10-13 19:21–19:26 用户拍板：
  1. 项目数据存在磁盘上的项目文件夹（关闭 [#269](https://github.com/Abe-Junwei/Jieyu/issues/269)）。
  2. 文件夹格式 = 解包后的 JYM 目录结构，IndexedDB 只当缓存（新单 [#275](https://github.com/Abe-Junwei/Jieyu/issues/275)）。
  3. 外壳 = Electron（关闭 [#251](https://github.com/Abe-Junwei/Jieyu/issues/251)；[#252](https://github.com/Abe-Junwei/Jieyu/issues/252) 改为 Electron 事实清单）。
  4. Mac 签名并公证，Windows 暂不签名（关闭 [#253](https://github.com/Abe-Junwei/Jieyu/issues/253)）。
  5. electron-updater 走 GitHub Releases 自动更新；数据格式升级前自动备份项目文件夹（关闭 [#254](https://github.com/Abe-Junwei/Jieyu/issues/254)、[#271](https://github.com/Abe-Junwei/Jieyu/issues/271)；落地见新单 [#277](https://github.com/Abe-Junwei/Jieyu/issues/277)）。
  6. API 密钥存系统钥匙串，AI 请求从 Electron 主进程发出（[#257](https://github.com/Abe-Junwei/Jieyu/issues/257) 缩为密钥界面；[#272](https://github.com/Abe-Junwei/Jieyu/issues/272) 按不再需要关闭）。
  7. 保留浏览器构建供开发与测试；存储层放在接口后，磁盘与 IndexedDB 两种实现（新单 [#274](https://github.com/Abe-Junwei/Jieyu/issues/274)）。
  8. D14 冻结的是磁盘项目文件夹格式，在第一个试用版发布之前（[#259](https://github.com/Abe-Junwei/Jieyu/issues/259) 改为冻结前清单）。
  9. 试用版只做中文界面，保留 i18n 结构（关闭 [#262](https://github.com/Abe-Junwei/Jieyu/issues/262)）。
  10. 试用版只露核心流程：导入录音、切分/标注、词库、导出 EAF/JYM、AI 辅助；其余隐藏或标实验（[#265](https://github.com/Abe-Junwei/Jieyu/issues/265) 转为盘点任务）。
  11. 内置示例项目，用现成的开放许可语料（[#256](https://github.com/Abe-Junwei/Jieyu/issues/256) 转为找语料的调研）。
  12. 崩溃上报：试用者选择开启的自动上报（如 Sentry），按主路线图 C1 脱敏（关闭 [#261](https://github.com/Abe-Junwei/Jieyu/issues/261)）。
  13. 试用名单与节奏由用户本人决定，不进路线图（关闭 [#264](https://github.com/Abe-Junwei/Jieyu/issues/264)）。
  14. 用户手册：图文中文快速上手，应用内帮助 + PDF（[#263](https://github.com/Abe-Junwei/Jieyu/issues/263) 转为任务）。
- 新单：[#276](https://github.com/Abe-Junwei/Jieyu/issues/276) Electron 骨架范围、[#278](https://github.com/Abe-Junwei/Jieyu/issues/278) 同步主路线图 §1。

## Not yet specified

- 与主路线图冲突：§1 North Star 写着「纯 Web 应用、非 WebView」、数据真源是浏览器 IndexedDB，与决定 3、1、7 冲突，待按 [#278](https://github.com/Abe-Junwei/Jieyu/issues/278) 改。
- 多台电脑：同一试用者换设备时项目文件夹怎么迁（拷文件夹还是导出 JYM）。
- 冻结之后的迁移演练：试用期间若必须改结构，升级路径如何验证。
- 试用者隐私与伦理：录音数据不出本机的承诺怎么写（与崩溃上报、AI 调用相关）。
- 性能底线：试用者常见电脑上的大录音/长项目表现。
- 试用结束后的去向：数据保留与转正式版。

## Out of scope

- 本地启动器 + 浏览器打开的路线（原 A/B）：用户改走桌面外壳。
- 远程托管网站、域名、国内访问与备案：用户明确不设服务器。
- 实时同步 / Supabase 云协作：只靠项目包互传（主路线图 C4 另行推进，不在这一程）。
- 附带或推荐本地模型（WebLLM、Ollama）：用自填云端密钥。
- 移动端。
- 试用名单与节奏：用户本人安排。
- Tauri：已选 Electron。
