---
title: execution/governance 文档索引
doc_type: execution-governance-index
status: active
owner: repo
last_reviewed: 2026-04-06
source_of_truth: governance-index
---

# execution/governance 文档索引

这里保存长期保留的工程治理规则、台账和文档治理说明。

## 文档治理运行口径

当前仓库的文档治理分成两层：

1. 严格治理面：`npm run check:docs-governance`
2. 全仓债务报告：`npm run report:docs-link-debt`

口径说明：

1. `check:docs-governance` 只对当前高价值文档面做严格校验，包括 frontmatter、角色声明和关键内部链接。
2. `report:docs-link-debt` 会扫描 `docs/` 下全部 Markdown，用于发现历史文档路径漂移或失效引用，但只报告不阻塞。
3. CI 中对应的独立 job 为 `docs-governance`；该 job 会同时运行上述两个命令，其中严格检查失败会阻塞合并，债务报告仅用于可见性。

推荐使用顺序：

1. 改完当前索引、architecture、services、adr 或 release-gates 文档后，先跑 `npm run check:docs-governance`
2. 做归档、迁移、批量改路径后，再跑 `npm run report:docs-link-debt`
3. 若要把检查设为 GitHub 远端必选项，请同步更新 branch protection 的 required checks

## 当前文档

- [GitHub分支保护配置清单.md](GitHub%E5%88%86%E6%94%AF%E4%BF%9D%E6%8A%A4%E9%85%8D%E7%BD%AE%E6%B8%85%E5%8D%95.md)
- [架构热点台账.md](%E6%9E%B6%E6%9E%84%E7%83%AD%E7%82%B9%E5%8F%B0%E8%B4%A6.md)
- [静默catch分级台账-2026-03-23.md](%E9%9D%99%E9%BB%98catch%E5%88%86%E7%BA%A7%E5%8F%B0%E8%B4%A6-2026-03-23.md)
- [文档归档与删减建议-2026-04-06.md](%E6%96%87%E6%A1%A3%E5%BD%92%E6%A1%A3%E4%B8%8E%E5%88%A0%E5%87%8F%E5%BB%BA%E8%AE%AE-2026-04-06.md)

## 使用原则

1. 这里的文档优先描述治理规则、守卫口径和归档原则。
2. 若要描述当前产品事实，请回到 `../../architecture/`。
3. 文档治理脚本与 CI 口径变更后，应同步更新本页和 `GitHub分支保护配置清单.md`，避免“脚本已变、文档未跟上”。