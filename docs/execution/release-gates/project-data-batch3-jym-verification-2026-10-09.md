---
title: 项目数据第 3 批第二个切片（JYM）验证记录
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-10-09
source_of_truth: tests/e2e/batch3Jym.spec.ts
---

# 项目数据第 3 批第二个切片（JYM）验证记录（2026-10-09）

对应方案：[项目、资料与持久化架构改进方案（修订五）](../plans/project-data-architecture-improvement-2026-10-08.md) 第 3 批，按 JYT → JYM → JYB 分切片。本记录覆盖 JYM（D1、D5 的 JYM 部分；7.1–7.4；T28、T31、T32、T37）。JYT 见 [JYT 验证记录](./project-data-batch3-jyt-verification-2026-10-09.md)，JYB 见 [JYB 验证记录](./project-data-batch3-jyb-verification-2026-10-09.md)。

## 范围

- 新 JYM 格式 `application/vnd.jieyu.jym`，与 JYT 共用项目包路径（`projectPackageService`）：
  - 只含一个项目，数据部分与 JYT 相同。
  - 带上该项目本机管理的媒体、附件、来源原件字节，放在 `bytes/` 下；清单实体写 `bytes: included`、`fileRef`、`contentSha256`、`contentSize`。本机没有字节的实体写 `bytes: omitted`，并在 `excluded` 里计数。
  - 加密时数据和每个字节文件都加密（每个文件单独 IV）。
- 旧的整库 JYM 路径删除；旧格式 `application/x-jieyu-media` 一律拒绝（T32）。
- 入站检查在预览阶段完成，全部通过才写入：路径安全、重复条目、`files[]` 的 sha256 与大小、孤儿文件、实体与 `fileRef` 一致、解密后逐个字节文件核对 sha256 与大小、每一条记录。
- 恢复为新项目（默认）：字节先挂回实体，再统一重映射 id；恢复后的媒体可直接播放，sha256 与原项目一致（T37）。
- 覆盖当前项目：沿用 JYT 规则（从未协作、二次确认、覆盖前快照、写事务内复查）；另外只有包内字节与本机同一 id 的字节完全相同才允许，不同就整体中止。

## 保守决定（方案未写明）

| 问题                     | 当前做法                                                                     |
| ------------------------ | ---------------------------------------------------------------------------- |
| 清单实体的 `mimeType`    | 新增可选字段，用于恢复 Blob 类型；`bytes: omitted` 的实体不得带该字段        |
| 本机缺字节的实体         | 照常导出，标 `omitted` 并计数；不阻止导出                                    |
| 容量                     | 整包读入内存，上限 512 MiB，读字节前先按记录的大小预检；流式处理留到第 4b 批 |
| 覆盖时包内字节与本机不同 | 整体中止，不替换本机字节                                                     |

## 自动化验证

| 项             | 命令                                                                                    | 结果        |
| -------------- | --------------------------------------------------------------------------------------- | ----------- |
| 类型检查       | `npx tsc --noEmit`                                                                      | 通过        |
| 改动文件 lint  | `npx eslint --max-warnings 0 <changed files>`                                           | 通过        |
| JYM 单元测试   | `npx vitest run src/services/JymService src/services/JytService src/hooks/importExport` | 通过        |
| 守卫与冻结检查 | `npm run check:architecture-guard` 等                                                   | 通过        |
| JYM e2e        | `npx playwright test --project=chromium tests/e2e/batch3Jym.spec.ts`                    | 通过        |
| 全量单元与 e2e | 与 JYB 切片合并在同一轮跑，结果见 JYB 验证记录                                          | 见 JYB 记录 |

测试编号对应：T28/T37 `JymService.test.ts` + `batch3Jym.spec.ts`；T31 `JymService.test.ts`；T32 `JymService.test.ts` + e2e。

## 已知限制

- 整包在内存里处理，大于 512 MiB 的项目请分开导出或不含音频导出 JYT；流式处理留到第 4b 批。
