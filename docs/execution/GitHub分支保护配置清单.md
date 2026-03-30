# GitHub 分支保护配置清单

用于把仓库内已经落地的 CI、PR 模板与架构门禁，真正绑定到 GitHub 远端分支保护上。

## 目标

在 `main` 与 `dev` 上强制执行以下约束：

1. 任何改动必须走 Pull Request。
2. PR 合并前必须通过 CI。
3. 架构门禁、测试、构建门禁失败时禁止合并。
4. 热点预警与结构回收要求，必须通过 PR 模板显式记录。

## 前提

在 GitHub 仓库页面先确认以下条件已经满足：

1. 默认工作流文件存在：[.github/workflows/ci.yml](.github/workflows/ci.yml)
2. PR 模板存在：[.github/pull_request_template.md](.github/pull_request_template.md)
3. 最近至少跑过一次成功的 PR 或 push CI，这样 GitHub 设置页里才能看到可选的 status checks。

## 建议保护对象

### `dev`

`dev` 是日常集成分支，建议开启完整保护。

推荐设置：

1. `Require a pull request before merging`：开启
2. `Require approvals`：关闭或保持 `0`
3. `Dismiss stale pull request approvals when new commits are pushed`：开启
4. `Require review from Code Owners`：关闭
5. `Require status checks to pass before merging`：开启
6. `Require branches to be up to date before merging`：开启
7. `Require conversation resolution before merging`：开启
8. `Require signed commits`：按你现有工作流决定，默认可关闭
9. `Require linear history`：可选，若你接受 merge commit 则关闭
10. `Allow force pushes`：关闭
11. `Allow deletions`：关闭
12. `Do not allow bypassing the above settings`：建议开启

必选 status checks：

1. `quality`
2. `build-guard`

说明：

1. 当前 `quality` job 内已经串行覆盖 `npm run typecheck`、`npm test`、`npm run report:architecture-hotspots`。
2. 当前 `build-guard` job 内已经覆盖 `npm run build:guard`。

### `main`

`main` 是稳定分支，建议至少与 `dev` 同等级保护，不要比 `dev` 更松。

推荐设置：

1. `Require a pull request before merging`：开启
2. `Require approvals`：关闭或保持 `0`
3. `Dismiss stale pull request approvals when new commits are pushed`：开启
4. `Require status checks to pass before merging`：开启
5. `Require branches to be up to date before merging`：开启
6. `Require conversation resolution before merging`：开启
7. `Allow force pushes`：关闭
8. `Allow deletions`：关闭
9. `Do not allow bypassing the above settings`：建议开启

必选 status checks：

1. `quality`
2. `build-guard`

## GitHub 页面操作步骤

### 方式 A：经典 Branch Protection Rule

1. 打开 GitHub 仓库。
2. 进入 `Settings`。
3. 进入 `Branches`。
4. 在 `Branch protection rules` 中点击 `Add rule`。
5. `Branch name pattern` 填 `dev`，按上文勾选对应项并保存。
6. 再新增一条规则，`Branch name pattern` 填 `main`，按上文勾选并保存。

### 方式 B：Rulesets

如果你的仓库使用新的 Rulesets：

1. 打开 `Settings`。
2. 进入 `Rules` 或 `Rulesets`。
3. 新建 ruleset，目标分支先选 `dev`。
4. 加入 pull request、status checks、conversation resolution、禁止 force push / delete 等规则。
5. 再为 `main` 建一个同级或更严格的 ruleset。

## Status Check 选择说明

GitHub 有时显示的是 workflow/job 组合名，有时显示 job 名称本身。当前仓库应以最近一次成功 CI 里实际出现的检查名为准。

如果设置页里出现多种近似名字，优先勾选与以下 job 对应的项：

1. `quality`
2. `build-guard`

若界面显示为带 workflow 前缀的形式，也选择对应 `CI` 工作流下的这两个检查。

## 与仓库内机制的对应关系

### `quality`

由 [.github/workflows/ci.yml](.github/workflows/ci.yml) 中的 `quality` job 提供，覆盖：

1. `npm run typecheck`
2. `npm test`
3. `npm run report:architecture-hotspots`

其中 `npm test` 又会继续覆盖：

1. `check:messages-imports`
2. `check:segmentation-storage-boundary`
3. `check:tier-boundary-imports`
4. `check:tierid-diffusion`
5. `check:architecture-guard`
6. `vitest run`

### `build-guard`

由 [.github/workflows/ci.yml](.github/workflows/ci.yml) 中的 `build-guard` job 提供，覆盖：

1. `npm run build:guard`

这会继续覆盖：

1. `npm run build`
2. `npm run profile:build-assets`
3. `npm run check:build-budgets`
4. `npm run audit:prod`

## 推荐的单人开发策略

如果你当前仍是单人维护，这样配置最稳妥：

1. 强制走 PR，但不强制最少 reviewer approval。
2. 强制 CI checks。
3. 强制 conversation resolution。
4. 禁止直接 push 到 `main` / `dev`。

这样可以保留单人开发速度，同时把“直接把结构回退或测试回归推上主分支”的风险压住。

## 配置后自检

分支保护配置完成后，做一次最小验证：

1. 从 `dev` 拉出一个测试分支。
2. 提交一个极小改动并发起 PR 回 `dev`。
3. 确认 PR 页面显示必需检查为 `quality` 与 `build-guard`。
4. 确认在 checks 未完成前，Merge 按钮不可用。
5. 确认若 PR discussion 未解决，Merge 仍被阻止。

## 当前无法本地自动化的部分

当前本地仓库已经具备 CI、PR 模板和门禁脚本，但是否能直接调用 GitHub API 自动下发 branch protection，取决于当前环境是否有：

1. 已登录且有权限的 GitHub CLI
2. 或可用的 GitHub token

若本地无认证上下文，则不能直接自动写入远端设置；这时按本文档在 GitHub 页面手工配置即可。