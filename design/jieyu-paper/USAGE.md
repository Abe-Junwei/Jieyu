# 用法

1. 产品侧引入 [`tokens.css`](tokens.css) 的上游 `src/styles/tokens.css`。暗色在根元素加 `data-theme="dark"`。
2. 规则看 [`DESIGN.md`](DESIGN.md)。画页面精稿去 Pixso 文件 `va44BZLBUSYRQ7KoiO3PJw`，用「组件」页的实例。
3. `tokens.css` 由 `npm run build:od-tokens` 生成，不要手改。`tailwind-v4.css`、`colors_and_type.css` 只引用它，不存值。
