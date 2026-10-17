---
title: 冻结前清单：D14 冻结磁盘项目文件夹格式
label: wayfinder:grilling
mode: HITL
status: open
assignee:
blocked_by: [008,010,025,030,031,036,043]
issue: https://github.com/Abe-Junwei/Jieyu/issues/259
---

# 冻结前清单：D14 冻结项目文件夹格式

## Question

2026-10-16 更新：D14 尚未冻结，也不能靠改文档完成。冻结对象不再是「SQLite + media/」。一份文稿同时只关联一条音频，父子链接不能跨文稿。冻结前要有格式原型、从含音频的备份恢复并播放、桌面写路径验证。本机已经导入过录音；能不能丢弃，要逐项盘点并由用户确认，不能用「没有要保留的真实数据」。哪一条决定现在有效，见 [ADR 目录](../../../adr/README.md)。

原先已定、现已不够：D14 在第一个试用版发布之前冻结，冻结对象曾写成项目文件夹格式（SQLite + media/）（[ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/main/docs/adr/0046-desktop-sqlite-project-folder.md) 第 8 条）。剩下仍要定：冻结前必须先合进 main 的在途改动（[#260](https://github.com/Abe-Junwei/Jieyu/issues/260)）、冻结前的加法迁移演练（[#281](https://github.com/Abe-Junwei/Jieyu/issues/281)）、版本号、谁确认、现有冻结检查（schemaFreeze.ts）如何扩到 SQLite 格式。

冻结前四项各归哪张单子（2026-10-16）：格式原型与跨录音文稿的迁移对拍已有合成版（[card-sqlite-file 规格](../../../execution/specs/card-sqlite-file/tasks.md)），剩下的列形状在 [025](025-folder-format.md)；含音频的恢复播放在 [008](008-backup-restore.md)；桌面写路径在 [043](043-desktop-file-ops.md)。旧浏览器库迁入（[044](044-browser-library-to-desktop.md)）不是冻结条件。

## Related

验证记录已从工作区移除。本单仍只定冻结时机与清单。
