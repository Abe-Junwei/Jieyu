---
title: ADR 0031 — AI Chat KeyVault 本地优先威胁模型与 connect-src 白名单
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-06-01
source_of_truth: architecture-decision
---

# ADR 0031：AI Chat KeyVault 本地优先威胁模型与 connect-src 白名单

## 背景

- `src/ai/config/keyVault.ts` 使用 Web Crypto（PBKDF2 + AES-GCM）加密 `localStorage` 中的 AI Chat 设置；派生口令为 `` `${window.location.origin}|jieyu.aiChat.settings` ``，后半段为固定字符串。
- 安全审计指出：该口令熵低，无法抵御同 origin XSS 或知晓 origin 的攻击者；同时 `index.html` CSP 的 `connect-src` 曾保留 `https:` / `wss:` 通配符兜底，扩大 XSS 后数据外泄面。
- `protobufjs` 经 `@opentelemetry/otlp-transformer`  transitive 依赖引入；CVE-2026-45740 要求 **≥ 8.2.0**。

## 决策

### 1. KeyVault 口令策略（保持 origin 派生，明确边界）

1. **不**在本阶段引入用户主口令 UI（避免与「零配置本地优先」产品路径冲突）。
2. 将 KeyVault 定位为 **「防 casual 本地读取」** 层：阻止明文 API key 落盘、阻止非脚本方直接读 `localStorage` 字符串；**不**声称抵御同 origin 恶意脚本。
3. 若未来需要「抵御物理访问 / 共享机器」级保护，另开 ADR 引入可选用户秘密或 OS 凭据 API，并与迁移路径绑定。

### 2. CSP `connect-src` 收紧

1. 从 `index.html` meta CSP **移除** `https:` / `wss:` 通配符。
2. 保留并维护**显式枚举**：Supabase、Sentry、常用 LLM/TTS 供应商、OpenStreetMap Nominatim、BAS WebServices、Hugging Face 模型 CDN 等。
3. **自托管 OTLP / 自定义 API 基址**：部署时在反向代理 HTTP 响应头扩展 `Content-Security-Policy`，或 fork 构建时追加 host；不在 meta 中恢复全局通配符。

### 3. protobufjs 供应链

1. `package.json` `overrides` 在 `@opentelemetry/otlp-transformer` 嵌套路径将 `protobufjs` 钉至 **8.2.0**（不强制 onnxruntime 的 7.5.8 线升级，该线已在 7.5.8 修复 CVE）。
2. 合并前跑 `npm audit`；若上游 OTEL 包仍拉旧版，保留顶层 override 直至依赖树干净。

## 影响

- **KeyVault**：安全文档与代码注释与实现一致；审计项从「未说明弱口令」降为「已接受本地优先边界」。
- **CSP**：未列出的第三方 connect 在默认构建下被浏览器拦截；需文档化部署扩展方式。
- **OTEL**：仅当 endpoint host 已在白名单或部署 CSP 扩展时可导出 trace。

## 备选方案（未采纳）

- **用户主口令**：交互与恢复成本高，留待显式产品需求。
- **保留 connect-src 通配符**：与严格 CSP 基线冲突。
- **protobufjs 7.5.8 降级**：与 OTEL 8.x 线不兼容，维持 8.2.0 override。

## 验证

- `npm audit`（protobufjs 相关项应清除或降级）
- `npm run typecheck`
- `npx vitest run src/observability/otel.test.ts`
- 手动：默认 LLM provider 请求、Supabase 协同、本地 embedding（Hugging Face CDN）仍可 connect
