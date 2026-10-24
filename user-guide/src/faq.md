---
title: 常见问题
---

# 常见问题

## 本站和 DeepWiki 各看什么？

本站是使用者的使用说明。开发者文档在 [DeepWiki](https://deepwiki.com/Abe-Junwei/Jieyu)：架构、ADR 和实现。仓库里的 `docs/` 也是工程师文档。使用说明的源码在仓库的 `user-guide/`。

## 为什么有的页面只有一段话？

录音与转写、词典已标出路径。标注与 IGT、导出与建档、协作与同步冲突仍是占位，等 Morph / B4、冻结解除后的建档导出、以及 [#342](https://github.com/Abe-Junwei/Jieyu/issues/342) 再补步骤。

## 英文页在哪里？

顶栏可以切到 English。英文站目前只有 [占位页](/en/)，正文以简体中文为准。

## 网页打不开怎么办？

开启 GitHub Pages 之后，站点地址是 <https://abe-junwei.github.io/Jieyu/>。

仓库目前 `has_pages=false`，Pages 尚未打开。维护者在 GitHub → Settings → Pages → Build and deployment，把 Source 设为 **GitHub Actions**。步骤写在仓库的 `user-guide/README.md`。地址若和上面不一致，以 Pages 设置页显示的 URL 为准，并同步修改 `user-guide/.vitepress/config.mjs` 里的 `base`。

## 数据在哪？

一次田野工作的录音、转写、标注和词典留在本机的当前项目里。协作同步见 [协作与同步冲突](/collaboration)。
