---
title: 整库审查 A0 基线与首批执行记录
doc_type: audit
status: draft
owner: repo
last_reviewed: 2026-10-11
---

# 整库审查 A0 基线与首批执行记录

关联[执行方案](../plans/repository-review-and-governance-2026-10-11.md)。这不是整库审查完成报告；下列结果只适用于所列基线和修复提交。

## 固定基线与工作区

- 2026-10-11 固定审查基线为远端 `main@e5581bfc383796787c3e358d49ff04a8986a8d21`；本地修复提交为 `faf8cffa`，未推送。执行前本地为 `4086e0b2`，缓存 `origin/main` 为 `53fa8295`；已 fetch 并在确认路径不重叠后快进合并，未重置工作区。远端相对原本地差 46 个提交、98 个文件。后续远端变更须另记增量。
- `package-lock.json` SHA-256：`b043d1545a497172ec990535ad2b939578769f739fa08d37d578e9ea67b021c5`。`git ls-files` 为 3,861 条；以 `core.quotePath=false` 统计，其中 `src/` 2,679、`docs/` 739、`scripts/` 250、`tests/` 81、`.github/` 24、`public/` 39。这只是覆盖分母，文件尚未逐一审查。
- 当前执行 Node `v26.10.0`，而 `.nvmrc` 要求 22；尝试临时取得 Node 22 的 `npm exec` 在等待期间无输出，已终止，故下列本机测试不是 Node 22 的验收证据。三份既有审计导出文件保留原状，未纳入修复。
- 已核对主库 `src/db/engine.ts` 为 `version(1)` 绿场基线；归档/恢复仍分别经过 JYM、JYT、JYB、项目包和公共 JSON 导入。完整入口、表、外部服务和 feature flag 清单**尚未完成**，A0 保持进行中。

## 首批链路与证据

R03/R04/R12 的一条危险链：`LinguisticService.importFromJSON` → `linguisticServiceDatabaseIo.importFromJSON` → `importDatabaseFromJson` → 同事务的字节保留检查 → `replace-all` 清表 → 读回。项目包、JYB、快照恢复也调用公共导入，但各自有额外预检；不能把公共 API 的缺口直接说成这些 UI 全部可触发。

确认 RV-001：当导入集合包含 `media_items: []` / `lexeme_assets: []`，而本机对应表有带 Blob 的行时，原检查只匹配入站同 ID 行，清表后本机字节消失且导入成功。先新增回归测试，修复前该测试失败；现于同一写事务清表前枚举未列入的本机带字节行，并以 `InboundByteConflictError` 整体中止。

确认 RV-002：协作项目快照在公共导入的同 ID 检查之后运行 `preWrite` 清理项目内容。快照之后新增的录音/附件行不在快照内，会被清理且导入成功。回归测试修前失败；现于同一事务、清理之前仅扫描目标项目的缺席字节行，冲突则回滚。具体状态见[发现台账](../governance/repository-review-findings-2026-10-11.md)。

修复后在当前工作树、Node 26 上执行：

| 检查                                                                      | 结果               | 边界                                                                                                                  |
| ------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                       | 通过               | 静态类型，不证明浏览器运行                                                                                            |
| 10 个定向 Vitest 文件（入站字节、JSON/项目快照、清理、JYM/JYT/JYB、恢复） | 93/93 通过，0 跳过 | fake-indexeddb；RV-001、RV-002 新增测试均修前红、修后绿；其他项目字节不被误拦                                         |
| 5 个相关 Chromium E2E 文件，`--retries=0`                                 | 17/17 通过，0 重试 | 在 RV-001 修复后、RV-002 修复前运行；覆盖项目包、恢复、占位轴等既有场景，不能证明 RV-002 或公共 JSON 输入的浏览器行为 |
| `git diff --check`                                                        | 通过               | 仅空白检查                                                                                                            |

本轮尚未跑完整 L1、多浏览器、Node 22、真实站点外备份恢复、云服务/RLS、性能负载和 R01–R16 全域深查。A1 也仅完成首两条危险链，不能据此签署整库或发布结论。

文档门禁：`check:docs-governance` 与 `check:architecture-guard` 通过；后者有 23 条接近阈值的既有热点告警。`check:plans-frontmatter` 因既有 `BF1-N3-归档导入拒绝孤儿行-2026-10-09.md` 的 `archive-import-complete` 状态失败，非本补丁新增。
