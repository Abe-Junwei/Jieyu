---
title: ADR 0137 - 口译草稿记下模型来源
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-21
source_of_truth: decision-record
depends_on:
  - ./0086-desktop-release-scope-and-format-freeze.md
  - ./0121-text-save-receipt-and-draft.md
  - ./0132-layer-scoped-transcription-and-legacy-create-routing.md
---

# ADR 0137：口译草稿记下模型来源

## 背景

口译和语音转写的识别结果先放在文字层草稿里，保存后才写入正文，并在 `unit_texts.provenance_json` 记下本机模型。模型名原先只留在进程内存里。关掉再开，草稿正文还在，保存后的来源却是空的。已经确认的正文再手改，旧的模型来源仍附在新文字上。

## 决定

1. **开发格式改为 `user_version` 33。** `unit_text_drafts` 增加可空的 `provenance_json`，约束与 `unit_texts.provenance_json` 相同。识别写入草稿时一并写入来源。编辑草稿时如果原文变了、这次又没有带来源，就把这一列清成 NULL。原文没变则保留。
2. **不写迁移器。** `user_version` 不是 33 的 `project.sqlite` 仍以「不是解语项目库」拒绝，文件字节保持原样。受控合成项目删掉该测试文件夹再打开。
3. **保存与草稿原文一致时，用来源写入正文。** 进程内存里的模型只作同一次运行的备用。关掉进程后以草稿行为准。
4. **手改已保存的正文且这次没有带来源时，把 `provenance_json` 写成 NULL。** 来源描述的是这一版正文怎么来的。撤销仍把上一版正文和它的来源一起换回。

## 未选方案

- **继续只放内存。** 重启后保存会丢掉模型归属。
- **手改保留旧来源。** 新文字不再是那次识别的原文。
- **就地给 32 的库补列。** 冻结规则是拒绝而不是改写。

## 影响

- 写入在 `src/db/desktop/textSave.ts` 与 `recordingClips.ts`。保存时 `desktopCall.ts` 读取草稿上的来源。
- 转写不接收调用方的音频字节。主进程读该层已保存的录音再交给本机模型。录音在写入前转成 wav，库里的那一份就是模型听到的那一份。
- 冻结记录换成 33 的 DDL 签名。
