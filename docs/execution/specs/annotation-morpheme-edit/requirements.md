---
title: annotation-morpheme-edit requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-04
source_of_truth: annotation-morpheme-edit-spec
---

# Requirements — Annotation Morpheme Edit (B4b)

## 1. What & Why

- **要做什么**：在 B4a-2 POS/gloss 之上开放 morpheme 分层编辑、手动 token 切分/合并、token→lexeme 链接编辑，以及 Leipzig 内联校验（模板走既有结构标注配置）。
- **为什么现在做**：主路线图 B4b / 标注页路线图 M1b 下半；B4a-2 已提供 `unit_tokens` 写链。
- **不做什么**：不写 `layer_units`；不做二次自动分词、note/tag/selfCertainty、analysisGraph 确认写入；不新建第二套 Validator 编辑器（复用 `/assets/structural-profiles`）；不接 ChatWindow / 转写 annotation controller / `AutoGlossService.glossUnit`；不改 `annotationPageEnabled` 默认值。

## 2. 用户场景（≤ 3 条）

1. Flag 开：在输入态把 `hello-world` 拆成 morpheme 格子，改 gloss 后保存，requery 读回。
2. 在 token 表单含空格或 `|` 时切成两个 token，或与下一 token 合并；词典查询词条并建立/解除 `token_lexeme_links`。
3. 非标准 Leipzig 缩写在 gloss 上标无效；侧栏指出当前用系统 Leipzig 模板并可打开结构标注配置。

## 3. 验收标准（可测）

- [ ] morpheme 写 `unit_morphemes` 后 `listMorphemesByTokenIds` readback 一致
- [ ] token 切分/合并写 `unit_tokens` 后 `listTokensByUnitIds` readback 一致
- [ ] 链接写 `token_lexeme_links` 后 `listTokenLexemeLinks` readback 一致
- [ ] `LeipzigValidator.validateGloss` 对未知大写缩写给出 invalid；flag 默认 false

## 4. 受影响代码地图

| 类别 | 文件 | 改动性质 |
| --- | --- | --- |
| Service | `linguisticServiceUnitTokenOps.ts` | `replaceMorphemesForToken` |
| Controller | `useAnnotationMorphologyController.ts` | 新增；不往 12-hook 壳叠加 |
| Helper | `pages/annotation/annotationMorpheme*.ts` 等 | 草稿 / 切分 / 链接 / Leipzig |
| UI | `AnnotationIgtRow.tsx` / workspace CSS / i18n | 词素格、切分、链接 |
| 测试 | 上列 helper + `AnnotationPage.test.tsx` | 写→readback |

## 5. 已知风险与依赖

- `useAnnotationWorkspaceController` 已满 12 hook，形态动作必须独立 controller。
- `removeToken` 会级联删 morpheme 与 token 链接；合并右侧 token 时接受该级联。
- Validator 模板编辑已在结构标注配置页；本切片只消费 Leipzig 内置 + 系统 profile 零标记/重叠标记作为自定义缩写。
