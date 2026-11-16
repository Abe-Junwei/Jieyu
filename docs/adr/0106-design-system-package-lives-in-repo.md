---
title: ADR 0106 - 设计系统包放在仓库，Open Design 软链接读取
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0102-desktop-design-drafts-move-to-open-design.md
  - ./0103-paper-field-notes-is-the-only-appearance.md
---

# ADR 0106：设计系统包放在仓库，Open Design 软链接读取

## 背景

外观有三份：仓库根目录 `DESIGN.md`、代码 `src/styles/tokens.css`，以及 Open Design 数据目录里的 `design-systems/jieyu-paper/`。设计包里的 `DESIGN.md` 和 `tokens.css` 是手抄的，已经和代码漂移（动效时长、暗色成功底色）。组件预览页只存在于 Open Design 数据目录，不在 git 里。

Open Design 列设计系统时接受目录软链接，但跳过文件软链接；没有按设计系统改目录的配置项。

## 决定

1. 设计系统包放在仓库 `design/jieyu-paper/`，进 git。Open Design 数据目录里的 `design-systems/jieyu-paper` 是指向它的目录软链接（本机一次性设置）。
2. 规则正文只有一份：`design/jieyu-paper/DESIGN.md`。根目录 `DESIGN.md` 是指向它的软链接，供 Stitch 和代理按惯例路径读取。
3. 值只有一份：`src/styles/tokens.css`。包里的 `tokens.css` 由 `npm run build:od-tokens` 用无头 Chromium 读出亮暗计算值，按 Open Design 的 token 名写成字面值，不手改。文件头记录源文件和正文的 sha256；`check:docs-governance` 比对哈希和根目录软链接，不开浏览器。
4. 包里不再保留导入时生成的值副本（`design-tokens.json`、`source/`）。`tailwind-v4.css`、`colors_and_type.css` 只 `@import` `tokens.css`。
5. Open Design 为设计系统自动建的编辑项目 `projects/ds-jieyu-paper` 也是指向 `design/jieyu-paper/` 的目录软链接，在「设计文件」里的改动直接落在仓库。它的私有目录 `.od-frames/`、`.od-skills/` 不进 git。不再保留 `.opendesign/` 镜像。（0.27.1 版界面里找不到「打开文件夹」入口，命令行导入又要桌面端签发的凭证，所以不走导入。）

本条取代 [ADR-0102](./0102-desktop-design-drafts-move-to-open-design.md) 中「约束写在 `.superdesign/design-system.md`，设计包从这里导入」一句。

## 未选方案

- **根目录 `DESIGN.md` 为真文件、包里放文件软链接**：Open Design 不列文件软链接，包里会缺 `DESIGN.md`。
- **`OD_DATA_DIR` 指向仓库**：会把 Open Design 的全部数据（项目、会话）搬进仓库。
- **代码改读包里的 `tokens.css`**：两套变量名同名不同义（`--border-soft`、`--focus-ring`），代码侧全量改名代价远大于生成一份映射。

## 影响

- 改外观的顺序固定：先改 `src/styles/tokens.css` 或 `DESIGN.md`，再跑 `npm run build:od-tokens`。只改代码 token 而不重新生成，`check:docs-governance` 失败。
- 新机器需要手动建两条 Open Design 软链接（`design-systems/jieyu-paper`、`projects/ds-jieyu-paper`）；Windows 检出需开启 git 符号链接支持。
- 生成映射写在 `scripts/build-od-design-tokens.mjs`；Open Design 新增 token 名时在那里补一行。
