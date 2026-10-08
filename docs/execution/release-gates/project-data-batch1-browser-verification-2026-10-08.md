---
title: 第一批（媒体字节保护）浏览器验证步骤
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-10-08
source_of_truth: tests/e2e/batch1MediaPreservation.spec.ts
---

# 第一批（媒体字节保护）浏览器验证步骤（2026-10-08）

对应方案：[项目、资料与持久化架构改进方案（修订五）](../plans/project-data-architecture-improvement-2026-10-08.md) 第一批（N2、N3、N4）。

自动化验收：`tests/e2e/batch1MediaPreservation.spec.ts`（Chromium，`npm run test:e2e:chromium -- tests/e2e/batch1MediaPreservation.spec.ts`）。

## 1. 先看清当前项目的录音状态

在任一页面打开浏览器开发者工具控制台，粘贴运行：

```js
(async () => {
  const db = globalThis.__jieyuDexie__;
  if (!db) { console.warn('数据库还没初始化：先打开首页或转写页再运行'); return; }
  await db.open();
  const texts = await db.texts.toArray();
  const titleOf = (id) => {
    const t = texts.find((row) => row.id === id);
    return (t && Object.values(t.title ?? {}).find((v) => typeof v === 'string' && v.trim())) || id;
  };
  const rows = [];
  for (const m of await db.media_items.toArray()) {
    const d = m.details ?? {};
    const blob = d.audioBlob;
    rows.push({
      项目: titleOf(m.textId),
      mediaId: m.id,
      文件名: m.filename,
      timelineKind: d.timelineKind ?? '(未写)',
      本机字节: blob instanceof Blob ? blob.size : (m.url ? 'url' : '无'),
      类型: blob instanceof Blob ? blob.type : '',
      导出时省略过: d.audioExportOmitted === true ? `是（原 ${d.audioExportOmittedByteSize ?? '?'} B）` : '',
      附属录音: typeof d.source === 'string' ? d.source : '',
      语段数: await db.layer_units.where('mediaId').equals(m.id).count(),
    });
  }
  console.table(rows);
  return rows;
})();
```

怎么读：

| timelineKind | 本机字节 | 含义 |
| --- | --- | --- |
| `acoustic` | 数字 | 正常录音，播放器应可用。 |
| `acoustic` | `无` | 缺字节的录音（常见于从不带音频的 JYT/JSON 导入，或旧版本导入时被清空）。播放器显示「当前媒体行无可解码播放的数据」。第一批只保证以后不再丢，**不能找回已经丢掉的字节**。 |
| `placeholder` | `无` | 占位时间轴（没有录音，只有逻辑秒）。 |

缺字节的录音可以这样补回：在转写页打开这条录音（地址栏 `/transcription?textId=<项目 id>&mediaId=<该 mediaId>`）→ 工具栏「导入媒体」→ 选同一个音频文件 → 导入方式选「覆盖当前所选媒体」。

## 2. 验证导入项目时不丢录音（N2）

1. 新建一个测试项目，在转写页导入一段真实的 WAV/MP3，确认能播放；运行第 1 节脚本，记下「本机字节」。
2. 左侧项目中心 → 导出 → JYT（是否加密选「取消」）。
3. 项目中心 →「导入项目」→ 选刚导出的 `.jyt` →「覆盖冲突项（upsert）」→ 开始导入。
4. 再运行第 1 节脚本：同一 `mediaId` 的「本机字节」不变；刷新页面后仍可播放。
5. 用「全量替换（replace-all）」重复第 3–4 步；再用 JYM 重复一次。

如果导入前播放器就不可用，先看第 1 节：那条录音本来就缺字节，不能用来验证这一项。

## 3. 验证首页「导入音频」（N4 与概览刷新）

1. 首页打开项目 → 导入 → 导入音频，选一个音频文件。
2. 文件列表出现新录音；概览里的「录音数」立即加一（修复前要等 5 分钟或刷新）。
3. 缺字节的录音和占位时间轴不会被晋升或合并（第 1 节脚本里它们的 `mediaId` 和语段数不变）。

## 4. 验证多条占位时间轴只晋升选中的那条（N4）

正常界面一个项目最多自动生成一条占位轴；要得到两条，可以在测试项目里：

1. 在转写页导入音频 A；再导入音频 B，导入方式选「新增一条媒体轨」。
2. 在 A、B 上各建一个语段。
3. 分别打开 A、B，工具栏「删除当前媒体」（句段保留，媒体行变为占位轨），两条都变成 `placeholder`。
4. 用第 1 节脚本查到 B 的 `mediaId`，打开 `/transcription?textId=<项目 id>&mediaId=<B 的 mediaId>`，工具栏「导入媒体」选一个新音频文件（时长提示框勾选「我已了解，继续导入」）。
5. 第 1 节脚本：只有 B 变成 `acoustic` 并有字节，A 仍是 `placeholder`，A 的语段数不变；不会出现合并。

## 5. 验证崩溃恢复不丢录音

崩溃恢复没有设置页入口。它是转写页顶部的横幅：只有恢复快照里有语段、且快照比库里语段的最后修改时间晚 2 秒以上时才出现（例如编辑后 3 秒内关掉标签页）。

1. 在一个有真实录音的项目里编辑语段文字，3 秒内关闭标签页（不要等自动保存）。
2. 重新打开转写页，顶部出现恢复横幅 → 点「恢复」。
3. 第 1 节脚本：录音的「本机字节」不变，播放器可用。

手工不容易稳定触发；自动化测试 `crash-recovery restore keeps real audio bytes` 直接写入恢复快照覆盖这一项。
