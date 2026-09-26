# 开放语料测试集

这些标注文件只在本机使用，用来检验解语的 ELAN、FLEx、LIFT 导入。`.eaf`、`.flextext`、`.lift`、`.xml` 已写入 `.gitignore`，提交和发布都不包含它们。清单在 `manifest.json`。每个文件保留原许可，不并入本仓库的 ISC 许可。

摘录只保留不超过 20 秒的前 8 条非空标注，以及与之对齐的词、语素和注释层。音视频没有下载。

## 本地文件

| 语言 | 区域 / 谱系 | 格式 | 许可 | 来源 |
| --- | --- | --- | --- | --- |
| Fanbyak | 瓦努阿图 / 南岛语 | ELAN，全文 | CC BY 4.0 | DoReCo；原档在 ELAR |
| Sümi | 那加兰 / 汉藏语 | ELAN，全文 | CC BY 4.0 | DoReCo；原档在 PARADISEC |
| Evenki | 西伯利亚 / 通古斯语 | ELAN 摘录 | CC BY 4.0 | DoReCo |
| Nǁng | 南非 / 图语 | ELAN 摘录 | CC BY 4.0 | DoReCo |
| Goemai | 尼日利亚 / 乍得语 | ELAN 摘录 | CC BY 4.0 | DoReCo；原档在 TLA |
| Ruuli | 乌干达 / 班图语 | ELAN 摘录 | CC BY 4.0 | DoReCo |
| Komnzo | 巴布亚新几内亚 / 亚姆语 | ELAN 摘录 | CC BY 4.0 | DoReCo |
| 北库尔德语 | 伊朗语支 | ELAN 摘录 | CC BY 4.0 | DoReCo |
| 多巴巴塔克语 | 苏门答腊 / 南岛语 | ELAN，全文 | CC BY 4.0 | Zenodo 10.5281/zenodo.20306721 |
| 糸满冲绳语 | 琉球语 | ELAN 摘录 | CC BY 4.0 | Zenodo 10.5281/zenodo.12592977 |
| 瓦劳语 | 委内瑞拉、圭亚那 / 孤立语 | FLEx 摘录 | CC BY 4.0 | Zenodo 10.5281/zenodo.10730621 |
| 阿帕拉伊语 | 巴西 / 加勒比语 | FLEx、LIFT 摘录 | Apache-2.0 | fmatter/cldflex 测试数据 |
| 布列塔尼语 | 法国 / 凯尔特语 | Pangloss XML 摘录 | CC BY-SA 4.0 | Pangloss / Cocoon |

引用以各文件头注释和 `manifest.json` 的 `source`、`doi` 为准。使用其中任何一份数据时，引用该份数据的作者，不要只写“解语测试集”。

## 看过但没有留在本机

- **Pangloss**：抽查了嘉绒语、姆沃特拉普语、纳语、卡卡贝语、林布语、也门阿拉伯语等条目。多数是 CC BY-NC-ND 或 CC BY-NC-SA。布列塔尼语那份是 CC BY-SA，所以本机留了摘录。
- **ELAR / ELDP**：目录页写明数据文件适用 ELAR Access Conditions，目录本身是 CC BY-NC-SA。本环境访问 elararchive.org 时被 Preservica 拦截（HTTP 403）。Fanbyak 的标注是存款人经 DoReCo 以 CC BY 再发布的版本，ELAR 原包没有复制进来。
- **Language Documentation & Conservation（ScholarSpace）**：巽他语、沃莱艾语的“北风与太阳 / 梨子的故事”等课堂存款可以下载 `.eaf` / `.flextext`，但条目和馆藏都没有写再分发许可，因此没有留在本机。期刊 PDF 本身多是 CC BY，附件并不自动沿用这个许可。
- **Toolbox**：这次打开的附录里没有找到许可允许再分发的标准格式（SFM）文本。Toolbox 解析仍由 `tests/golden/toolbox/` 的合成样本覆盖。

## 私人田野材料

木雅语两份 ELAN 来自采集人自己的校对稿，许可记为 `private-local`：只在本机跑导入，不公开、不随发布分发。媒体地址改成相对文件名，绝对备份路径没有留在副本里。

| 文本 | 文件 |
| --- | --- |
| The adventure of three children | `elan/munya-0105a-three-children.eaf` |
| Grandpa lytsa autobiography | `elan/munya-0101b-lytsa-autobiography.eaf` |

两份都是全文。转写层是 `Transcription`（`mvm-fonipa-x-emic`），译文层是 `Phrase Free Translation`。

## 本机补入

这些文件同样只在本机，不进入提交。DoReCo 标注按 CC BY 4.0 摘录。Pangloss 上的多续、尔苏、里汝、车臣语是 CC BY-NC-ND 2.5。多特亚尔语史诗摘录在档案中标为可自由访问，版权归 Michailovsky，没有 Creative Commons 许可。

新覆盖的谱系和文字包括：达拉本语（澳大利亚）、阿拉帕霍语、斯万语（格鲁吉亚文）、多尔干语和卡马斯语（西里尔字母）、济州语（谚文）、多续语（汉字与国际音标，含语素注释层）、多特亚尔语（天城文）。阿拉伯文、藏文、缅文和因纽特语音节文字这一轮没有下到标注文件。

## 测试

`openCorporaImport.test.ts` 在本机文件存在时导入每份 ELAN / FLEx / LIFT，并在有转写句时做一次导出再导入。文件不在本机时，对应用例跳过。Pangloss XML 只检查句子和译文是否读得出来；解语目前没有这个格式的导入器。
