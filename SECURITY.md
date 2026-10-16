# 安全策略 | Security Policy

解语把语料和模型密钥放在使用者自己的机器上。本页说明如何私下报告漏洞、我们优先看的范围，以及按设计已经接受的边界。

内部架构决定仍以 `docs/adr/` 为准。本页是对外的报告入口，不替代那些 ADR。

## Reporting a vulnerability | 报告漏洞

**请不要在公开 Issue、Discussion 或 Pull Request 里报告安全问题。**

请使用 GitHub 私人漏洞报告：

1. 打开 <https://github.com/Abe-Junwei/Jieyu/security/advisories/new>（仓库 **Security** → **Report a vulnerability**）。
2. 写清问题、受影响的版本或 commit，以及复现步骤。

我们尽量在 **72 小时**内确认收到。已经确认的高危问题会尽快在 `main` 上修复或缓解。除非你希望匿名，我们会在变更说明里致谢。

若该页面尚未开放私人报告，请通过 GitHub 联系 [@Abe-Junwei](https://github.com/Abe-Junwei)。在维护者回复之前，仍然不要开公开 Issue。

## Scope | 优先处理的范围

当前可运行的检出是浏览器应用（Vite、React、TypeScript）。语料在本机 IndexedDB（Dexie）里。我们尤其希望收到这些报告：

- **IndexedDB / 本地语料**：跨源读到别的项目的行，或一次写入把别的项目的数据改掉。
- **本地密钥**：AI API key 从浏览器 KeyVault、页面日志、网络请求或崩溃上报里泄露。浏览器构建把密钥放在 `localStorage` 的 AES-GCM 封装里（`src/ai/config/keyVault.ts`，ADR-0031）。
- **CSP**：绕过严格 `script-src`，或把数据发到 `connect-src` 名单之外。注入面包括转写文本、AI 输出、PDF 和导入文件（ADR-0021、ADR-0031）。
- **协作快照**：快照超出当前项目、恢复时整库覆盖，或把 AI 密钥、AI/MCP 表、审计表带进快照（ADR-0034）。
- **导入导出**：用项目快照或整库 JSON 备份，把一个项目的词库写进另一个项目。

## Known limitations | 按设计存在的边界

下面这些是已经写进 ADR 的边界。可以利用它们造成未声明影响的绕过，仍请按上一节私下报告。

- **KeyVault 防的是随手查看。** 口令由站点 origin 加固定后缀派生（PBKDF2 + AES-GCM），用来避免 API key 以明文留在 `localStorage`。同源脚本可以读到同一份 origin 数据。同一浏览器配置档里、能打开该 origin 存储的程序也可以。这不是硬件密钥，也不是用户主口令（ADR-0031）。
- **语料放在 IndexedDB 里，按浏览器源隔离。** 保护范围是这个浏览器配置档。
- **协作快照是按项目裁剪的 JSON。** 它上传到当前配置的协作后端（Supabase Storage），应用用校验和核对内容是否完整。访问控制靠该后端。快照不含 AI/MCP 表和审计表。恢复时只更换该项目的行，不整库清空（ADR-0034）。
- **桌面钥匙串还没有接到这个检出。** 已接受的桌面方案是：密钥进系统钥匙串，桌面构建去掉协作代码（ADR-0047）。现在仓库里跑起来的是浏览器构建。
- **只维护最新代码。** 安全修复进入 `main`。仓库有正式发布标签时，只支持最新标签。

## Supported versions | 支持的版本

| 版本 | 支持 |
| --- | --- |
| `main` 上的最新提交；若已有发布标签，则同时支持最新标签 | 是 |
| 更旧的标签和历史提交 | 否 |
