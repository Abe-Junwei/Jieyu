# 使用纸本田野笔记

生成或修改解语的页面时：

1. 先读 [`DESIGN.md`](DESIGN.md)，再读 [`tokens.css`](tokens.css)。颜色、字号、间距、阴影只取这两个文件里写明的值。
2. 对照 [`system/index.html`](system/index.html) 列出的预览页，找已有组件的写法，不新造变体。
3. 字号只有 6 档（20/28、16/24、14/22、13/20、12/18，IPA 16/24），最小 12px。
4. 组件内间距只用 4、8、12、16、24、32px。40、48、64px 只给页面级留白。不用 20、10、6px。
5. 阴影只有三档，且只给浮层：`--shadow-popover`、`--shadow-float`、`--shadow-modal`。工作面、面板、卡片不加投影。焦点用 `--focus-ring`。
6. 墨色既是正文也是主按钮、选中、焦点和播放头。`--secondary` 只给链接和次要标签。红色只表示失败。说话人轨和层联动线用 `--series-ink-*` 的深浅加线型加字母标记，不用彩色。
7. 模态遮罩用 `--scrim`。
8. 示例文字用虚构卡朗语，不用真实语料，不加感叹号。

`tokens.css` 由仓库 `src/styles/tokens.css` 生成（`npm run build:od-tokens`），不要手改；改外观先改代码 token。`tailwind-v4.css`、`colors_and_type.css` 只引用 `tokens.css`。
