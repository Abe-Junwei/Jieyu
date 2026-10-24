# 解语设计交付终审 · 2026-10-24

范围：最新工程规范HTML、工程补全文档、基础设计索引，与当前源码中相关组件/路由/交互handler对照。不是产品逻辑审计或发布验收。

设计视角：语言记录者以项目、文稿、媒体、层和语段为主要对象，在播放、定位、转写、IGT、词典和来源检索之间连续工作。优先保持编辑上下文、可读密度与数据状态；禁止卡片层层嵌套和没有业务依据的成功、同步、推断声明。

## 本轮已直接修订

1. 清除未验收却标Frozen的标题，统一1440×1000参考画布。
2. 恢复声学检查器/独立AI窗的非模态边界；去掉虚构的Cmd+[、Cmd+]、Cmd+Shift+A。
3. 拆分完整性阻断与危险操作确认，消除相反的Esc规则。
4. 在实际HTML加入时间轴、IGT、媒体层草稿和AI窗口的源码键盘表，不再只链接外部说明。
5. 修正PanelButton尺寸/变体、FormField/ModalPanel接口、TimelineLaneDraftEditorCell名称与草稿状态。
6. 功能状态使用text/solid/bg/border语义，结构边框与控件识别边界分开；焦点偏移统一2px。
7. 清理8–11px可读信息样式和错误的全屏达标声明；去掉未经计算的暗色对比度数字。
8. 统一先收起检查器、后收起上下文栏的窗口策略；保留滚动和长文本规则。
9. 将AI推断、语料与绑定状态标为合成图例，去掉假WASM执行流程与真实能力暗示。
10. 新增录音/混合层、麦克风权限、条件桌面项目锁与同步盘、导出、关闭项目、清理重置和诊断隐私规则。
11. 增加可见焦点、reduced-motion与文档窄窗口目录折叠规则；局部实例以图例而非真实可操作产品呈现。
12. 清理交付索引中的多版本说明，以人工核对文本与本地已审校HTML作为当前依据。

## 已核对代码证据

- src/components/ui/PanelButton.tsx、FormField.tsx、ModalPanel.tsx、DialogOverlay.tsx：现有接口与焦点/关闭组合。
- src/hooks/transcription/useTimelineAnnotationHelpers.tsx：IME、Enter/Tab、Esc事件语义。
- src/hooks/transcription/useTimelineLaneTextDraftAutosave.ts：变化与失焦保存入口。
- src/pages/annotation/annotationKeyboardMachine.ts：行焦点与输入焦点、建议采纳、提交与播放区分。
- src/pages/TranscriptionPage.ChatWindow.layout.ts：Cmd/Ctrl+J与Esc最小化。
- src/components/TimelineAnnotationItem.tsx：选择/活动/当前层/重叠/置信度/人工确信度/保存状态。
- src/components/ImportTimelineMismatchAckFields.tsx、DeleteLayerConfirmDialog.tsx：预检分支与保留单元选项。
- src/pages/LanguageMetadataWorkspaceCustomFieldsSection.tsx、LexiconAttachmentSection.tsx：动态字段与多模态附件。
- src/components/TimelineTranslationAudioControls.tsx：录音、播放、转写与不可用状态。
- src/components/DbIntegrityBlockingOverlay.tsx：恢复性阻断层及不同失败类型。
- src/components/settings/SettingsDataTab.tsx：偏好/缓存重置与项目删除的区别。
- src/desktop/skeleton/openProject.ts、projectLock.ts：条件桌面骨架返回值，不等于完整产品已接通。

## 检查与判定

- 可重复内容检查：`python3 scripts/check-ui-design-delivery.py`。检查HTML锚点、关键错误语句、已知接口、token及新增覆盖；不能证明全部UI交互正确。
- 本轮浏览器视觉复核未执行：浏览器安全策略不允许自动读取当前file://页面，不能获取观察权限；未通过替代浏览器或临时服务器绕过。静态内容检查不能代替视觉、布局和交互验收。
- 设计文件依赖字体和Tailwind CDN，属于设计预览；产品实施不得直接复制为运行架构。
- 当前产品功能正确性、数据库写入读回、桌面真实项目、全量键盘与辅助技术、跨平台暗色/200%字号验收：HOLD，未执行。
- 历史Stitch自动生成图稿不作为精确接口或业务语义的来源；精确文本在项目内重新上传并验证后，以该上传节点及本地文档为准。

参考模式沿用本项目既定依据：Apple HIG Sidebars / Lists and tables（分栏与扫描），WAI-ARIA APG Modal Dialog（焦点边界），WCAG 2.2 Contrast（文字和图形对比度）。尺寸与层级数值是解语设计提案，不冒称由这些规范强制规定。

终审Stitch文本节点：3107358911418197964；设计系统资产：3ef0f935718b440abfbb59a94ae64be4。历史远端图稿不作为精确实施入口。
