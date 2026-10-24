# 解语使用说明（user-guide）

面向使用者的 VitePress 站点。源码在本目录的 `src/`，配置在 `.vitepress/config.mjs`。

仓库里的 [`docs/`](../docs/README.md) 继续放工程师文档（ADR、架构、开发、执行、wayfinder）。不要把 `docs/` 改成 VitePress 源码，也不要用本站替换 [DeepWiki](https://deepwiki.com/Abe-Junwei/Jieyu)。

| 读者 | 去哪里 |
| --- | --- |
| 使用解语 | 本目录，发布后为 <https://abe-junwei.github.io/Jieyu/> |
| 改代码、看架构 | [DeepWiki](https://deepwiki.com/Abe-Junwei/Jieyu) 与 [`docs/`](../docs/README.md) |

包管理与仓库根目录一致，使用 **npm**（根目录没有 pnpm workspace）。本目录有自己的 `package.json`，不写入应用依赖。

## 本地预览

Node 22（与根目录 [`.nvmrc`](../.nvmrc) 相同）。

```bash
cd user-guide
npm ci
npm run docs:dev
```

开发服务器带有站点 `base`，打开 <http://localhost:5173/Jieyu/>。

```bash
npm run docs:build
npm run docs:preview
```

`docs:build` 的产物在 `user-guide/.vitepress/dist/`（已 gitignore）。

## 加一页

1. 在 `src/` 新增 Markdown（英文占位放在 `src/en/`）。
2. 把标题加进 `.vitepress/config.mjs` 的中文侧栏 `zhSidebar`。
3. 再跑一次 `npm run docs:build`。

## GitHub Pages

2026-10-24 查询仓库 API：`has_pages=false`。本目录和工作流**不会**替你打开 Pages。没有仓库管理权限的 token 也改不了这个开关。

发布靠 [`.github/workflows/user-guide-pages.yml`](../.github/workflows/user-guide-pages.yml)：

- 拉取请求里会构建，用来确认 VitePress 能编过。
- 推到 `main`，或在 `main` 上手动运行该工作流时，才会部署。
- 在 Pages 仍关闭时，部署作业会失败。构建作业不依赖 Pages 开关（故意没用 `actions/configure-pages`，那个动作在 Pages 未配置时会直接失败）。

### 打开 Pages

1. 打开 <https://github.com/Abe-Junwei/Jieyu/settings/pages>。
2. **Build and deployment → Source** 选 **GitHub Actions**（不要选 Deploy from a branch）。
3. 保存后，等 `main` 上的 `user-guide-pages` 工作流成功，或在 Actions 里手动重跑它。
4. 预期地址：<https://abe-junwei.github.io/Jieyu/>。
5. 若设置页给出的 URL 路径或大小写不同，把 `.vitepress/config.mjs` 里的 `pagesBase` 改成该路径（前后都要有 `/`），再构建部署。

站点 `base` 现为 `/Jieyu/`，对应上面的项目页地址。
