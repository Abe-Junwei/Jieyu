# 用法

1. 引入 [`tokens.css`](tokens.css)。暗色在根元素加 `data-theme="dark"`，它覆盖同名变量，不是另一套命名。
2. 规则看 [`DESIGN.md`](DESIGN.md)，组件写法看 [`system/index.html`](system/index.html) 下的预览页。
3. `tokens.css` 由仓库 `src/styles/tokens.css` 生成（`npm run build:od-tokens`），不要手改。`tailwind-v4.css`、`colors_and_type.css` 只引用它，不存值。
