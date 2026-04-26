---
title: frame-ancestors 部署落地说明
doc_type: guide
status: active
owner: repo
last_reviewed: 2026-04-25
source_of_truth: deployment-guide
---

# frame-ancestors 部署落地说明

## 背景

`frame-ancestors` 只能通过 HTTP 响应头下发，不能放在 HTML 的 `<meta http-equiv="Content-Security-Policy">` 中。

如果放在 meta 里，浏览器会直接忽略，并在控制台输出类似下面的警告：

```text
The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.
```

当前仓库已做的处理：

1. 开发环境与 `vite preview`：由 [vite.config.ts](../../vite.config.ts) 通过响应头下发 `Content-Security-Policy: frame-ancestors 'none'`
2. Vercel：由 [vercel.json](../../vercel.json) 下发
3. Netlify / Cloudflare Pages：由 [public/_headers](../../public/_headers) 下发（构建后复制到 `dist/_headers`）

## 当前策略

- `Content-Security-Policy: frame-ancestors 'none'`
- `X-Frame-Options: DENY`

说明：

1. `frame-ancestors 'none'` 是现代浏览器的主策略。
2. `X-Frame-Options: DENY` 是兼容性补充，不替代 CSP。
3. 若未来产品需要被 iframe 嵌入，必须同步评审这两条头，不能只改一处。

## 各部署方式

### Vercel

仓库已内置 [vercel.json](../../vercel.json)，无需额外改动。

### Netlify

仓库已内置 [public/_headers](../../public/_headers)。

Vite 构建后会生成 `dist/_headers`，Netlify 会自动读取。

### Cloudflare Pages

Cloudflare Pages 支持与 Netlify 同格式的 `_headers` 文件。

仓库中的 [public/_headers](../../public/_headers) 会在构建后进入 `dist/_headers`，可直接复用。

### Nginx

如果生产环境走 Nginx 反向代理或静态站点服务，请显式添加：

```nginx
add_header Content-Security-Policy "frame-ancestors 'none'" always;
add_header X-Frame-Options "DENY" always;
```

若站点有 `location /`、静态资源或 SPA fallback 配置，请确保最终返回 HTML 的响应路径也带上这两个头。

## 验证方法

### 本地开发

```bash
npm run dev
```

打开浏览器 DevTools，检查文档响应头中是否存在：

- `Content-Security-Policy: frame-ancestors 'none'`
- `X-Frame-Options: DENY`（若由对应平台提供）

### 本地预览

```bash
npm run build
npm run preview
```

### 线上验证

可用以下命令检查响应头：

```bash
curl -I https://your-domain.example.com/
```

期望看到：

```text
Content-Security-Policy: frame-ancestors 'none'
X-Frame-Options: DENY
```

## 发布检查清单

发布前至少确认以下事项：

1. 本地 `npm run dev` 打开页面后，控制台不再出现 `frame-ancestors` 的 meta 警告。
2. 本地 `npm run build && npm run preview` 后，文档响应头包含 `Content-Security-Policy: frame-ancestors 'none'` 与 `X-Frame-Options: DENY`。
3. 预发或生产环境用 `curl -I` 检查最终域名返回的响应头，而不是只看本地构建产物。
4. 若部署平台有独立的 header 配置面板或 CDN 规则，确认没有被平台侧规则覆盖或移除。
5. 若产品需求变更为允许 iframe 嵌入，必须同步修改 CSP、`X-Frame-Options`、部署配置与安全评审记录。

## 变更边界

若未来需要支持嵌入：

1. 明确允许的宿主来源
2. 调整 `frame-ancestors`
3. 同步调整 `X-Frame-Options`
4. 补产品与安全评审记录

不要只改 [index.html](../../index.html)，因为 meta 无法承载该策略。