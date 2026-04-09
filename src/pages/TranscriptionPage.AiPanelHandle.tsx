/**
 * AI 面板手柄组件：包含悬浮区、拖拽缩放器、折叠按钮
 * AI panel handle cluster: hover zone, drag resizer, collapse toggle
 */
import React from 'react';
import { t, type Locale } from '../i18n';

interface Props {
	locale: Locale;
	isAiPanelCollapsed: boolean;
	setIsAiPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
	handleAiPanelResizeStart: (e: React.PointerEvent<HTMLDivElement>) => void;
	handleAiPanelToggle: () => void;
}

export function TranscriptionPageAiPanelHandle({
	locale,
	isAiPanelCollapsed,
	setIsAiPanelCollapsed,
	handleAiPanelResizeStart,
	handleAiPanelToggle,
}: Props) {
	return (
		<div className={`transcription-ai-panel-handle-cluster${isAiPanelCollapsed ? ' transcription-ai-panel-handle-collapsed' : ''}`}>
			<div
				className="transcription-ai-panel-hover-zone"
				onMouseEnter={() => {
					if (isAiPanelCollapsed) {
						setIsAiPanelCollapsed(false);
					}
				}}
				style={{ display: isAiPanelCollapsed ? undefined : 'none' }}
				aria-hidden="true"
			/>
			<div
				className="transcription-ai-panel-resizer"
				onPointerDown={handleAiPanelResizeStart}
				role="separator"
				aria-orientation="vertical"
				aria-label={t(locale, 'transcription.panel.resizeAiPanel')}
			/>
			<button
				type="button"
				className="transcription-ai-panel-toggle"
				onPointerDown={(e) => e.stopPropagation()}
				onClick={handleAiPanelToggle}
				onMouseEnter={() => {
					if (isAiPanelCollapsed) {
						setIsAiPanelCollapsed(false);
					}
				}}
				aria-label={isAiPanelCollapsed
					? t(locale, 'transcription.panel.expandAiPanel')
					: t(locale, 'transcription.panel.collapseAiPanel')}
			>
				<span className="transcription-panel-toggle-icon" aria-hidden="true">
					{isAiPanelCollapsed ? '‹' : '›'}
				</span>
			</button>
		</div>
	);
}
