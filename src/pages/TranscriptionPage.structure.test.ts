import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type JsxWithClass = {
  node: ts.JsxElement | ts.JsxSelfClosingElement;
  start: number;
  end: number;
};

function getClassNameText(attr: ts.JsxAttribute, sourceFile: ts.SourceFile): string {
  if (!attr.initializer) return '';
  if (ts.isStringLiteral(attr.initializer)) {
    return attr.initializer.text;
  }
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    return attr.initializer.expression.getText(sourceFile);
  }
  return attr.initializer.getText(sourceFile);
}

function findFirstJsxByClassName(sourceFile: ts.SourceFile, classNeedle: string): JsxWithClass | null {
  let found: JsxWithClass | null = null;

  const visit = (node: ts.Node) => {
    if (found) return;

    if (ts.isJsxElement(node)) {
      const classAttr = node.openingElement.attributes.properties.find((prop): prop is ts.JsxAttribute => (
        ts.isJsxAttribute(prop) && prop.name.getText(sourceFile) === 'className'
      ));

      if (classAttr && getClassNameText(classAttr, sourceFile).includes(classNeedle)) {
        found = {
          node,
          start: node.getStart(sourceFile),
          end: node.getEnd(),
        };
        return;
      }
    }

    if (ts.isJsxSelfClosingElement(node)) {
      const classAttr = node.attributes.properties.find((prop): prop is ts.JsxAttribute => (
        ts.isJsxAttribute(prop) && prop.name.getText(sourceFile) === 'className'
      ));

      if (classAttr && getClassNameText(classAttr, sourceFile).includes(classNeedle)) {
        found = {
          node,
          start: node.getStart(sourceFile),
          end: node.getEnd(),
        };
        return;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

function isRangeNested(inner: JsxWithClass, outer: JsxWithClass): boolean {
  return inner.start > outer.start && inner.end < outer.end;
}

describe('TranscriptionPage structure invariants', () => {
  it('keeps transcription-list-main outside transcription-waveform-area', () => {
    // The actual component JSX lives in TranscriptionPage.Orchestrator.tsx
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const waveformArea = findFirstJsxByClassName(sourceFile, 'transcription-waveform-area');
    const listMain = findFirstJsxByClassName(sourceFile, 'transcription-list-main');

    expect(waveformArea).not.toBeNull();
    expect(listMain).not.toBeNull();

    if (!waveformArea || !listMain) return;

    expect(isRangeNested(listMain, waveformArea)).toBe(false);
    expect(listMain.start).toBeGreaterThan(waveformArea.end);
  });

  it('keeps waveform height resize handle in layout', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const waveformArea = findFirstJsxByClassName(sourceFile, 'transcription-waveform-area');
    const waveformResizeHandle = findFirstJsxByClassName(sourceFile, 'transcription-waveform-resize-handle');

    expect(waveformArea).not.toBeNull();
    expect(waveformResizeHandle).not.toBeNull();

    if (!waveformArea || !waveformResizeHandle) return;

    expect(waveformResizeHandle.start).toBeGreaterThan(waveformArea.end);
  });

  it('keeps media-scoped speaker focus memory restore logic', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const controllerPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSpeakerController.ts');
    const controllerCode = fs.readFileSync(controllerPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useSpeakerFocusController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionSpeakerController } from './useTranscriptionSpeakerController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionSpeakerController({')).toBe(true);
    expect(orchestratorCode.includes("import { useSpeakerFocusController } from './useSpeakerFocusController';")).toBe(false);
    expect(controllerCode.includes("import { useSpeakerFocusController } from './useSpeakerFocusController';")).toBe(true);
    expect(controllerCode.includes('} = useSpeakerFocusController({')).toBe(true);
    expect(controllerCode.includes("import { useSpeakerActionRoutingController } from './useSpeakerActionRoutingController';")).toBe(true);
    expect(controllerCode.includes('} = useSpeakerActionRoutingController({')).toBe(true);
    expect(controllerCode.includes("import { useSpeakerActions } from '../hooks/useSpeakerActions';")).toBe(true);
    expect(controllerCode.includes('} = useSpeakerActions({')).toBe(true);

    // 媒体维度记忆映射存在 | Media-scoped memory map exists
    expect(hookCode.includes('speakerFocusTargetMemoryByMediaRef')).toBe(true);
    // 以媒体 id 作为记忆键 | Uses media id as memory key
    expect(hookCode.includes("const speakerFocusMediaKey = selectedTimelineMediaId ?? '__no-media__';")).toBe(true);
    // 切换媒体时恢复记忆 | Restores memory on media switch
    expect(hookCode.includes('const saved = speakerFocusTargetMemoryByMediaRef.current[speakerFocusMediaKey];')).toBe(true);
    expect(hookCode.includes('setSpeakerFocusTargetKey(saved ?? null);')).toBe(true);
    // 更新聚焦目标时写回当前媒体记忆 | Persists selection back to current media memory
    expect(hookCode.includes('speakerFocusTargetMemoryByMediaRef.current[speakerFocusMediaKey] = nextKey;')).toBe(true);
  });

  it('keeps speaker focus fallback guard for invalid explicit target', () => {
    const hookPath = path.resolve(process.cwd(), 'src/pages/useSpeakerFocusController.ts');
    const code = fs.readFileSync(hookPath, 'utf8');

    // 显式目标不在当前媒体可选集合时，解析为 null | Resolve to null when explicit target is not in current media options
    expect(code.includes('return speakerFocusOptionKeySet.has(speakerFocusTargetKey) ? speakerFocusTargetKey : null;')).toBe(true);
    // 检测到无效目标后回写清空，防止 focus-hard 全空白 | Clear invalid explicit target to avoid focus-hard blank state
    expect(code.includes('if (speakerFocusOptionKeySet.has(speakerFocusTargetKey)) return;')).toBe(true);
    expect(code.includes('setSpeakerFocusTargetForCurrentMedia(null);')).toBe(true);
  });

  it('keeps media-scoped track entity persistence integration', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const stateHookPath = path.resolve(process.cwd(), 'src/pages/useTrackEntityStateController.ts');
    const stateHookCode = fs.readFileSync(stateHookPath, 'utf8');
    const persistenceHookPath = path.resolve(process.cwd(), 'src/pages/useTrackEntityPersistenceController.ts');
    const persistenceHookCode = fs.readFileSync(persistenceHookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTrackEntityStateController } from './useTrackEntityStateController';")).toBe(true);
    expect(orchestratorCode.includes("import { useTrackEntityPersistenceController } from './useTrackEntityPersistenceController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTrackEntityStateController({')).toBe(true);
    expect(orchestratorCode.includes('useTrackEntityPersistenceController({')).toBe(true);
    expect(orchestratorCode.includes('trackEntityPersistenceContext.trackEntityStateByMediaRef')).toBe(true);
    expect(orchestratorCode.includes('trackEntityPersistenceContext.trackEntityHydratedKeyRef')).toBe(true);

    expect(stateHookCode.includes('const { activeTextId, selectedTimelineMediaId, setTranscriptionTrackMode } = input;')).toBe(true);
    expect(stateHookCode.includes("const trackEntityProjectKey = activeTextId?.trim() || '__no-project__';")).toBe(true);
    expect(stateHookCode.includes('const trackEntityScopedKey = selectedTimelineMediaId ? `${trackEntityProjectKey}::${selectedTimelineMediaId}` : null;')).toBe(true);
    expect(stateHookCode.includes('trackEntityStateByMediaRef.current = dbStateMap;')).toBe(true);
    expect(stateHookCode.includes('const saved = getTrackEntityState(trackEntityStateByMediaRef.current, trackEntityScopedKey);')).toBe(true);
    expect(stateHookCode.includes('trackEntityHydratedKeyRef.current = trackEntityScopedKey;')).toBe(true);

    expect(persistenceHookCode.includes('if (trackEntityHydratedKeyRef.current !== trackEntityScopedKey) return;')).toBe(true);
    expect(persistenceHookCode.includes('const next = upsertTrackEntityState(')).toBe(true);
    expect(persistenceHookCode.includes('saveTrackEntityStateMap(next')).toBe(true);
    expect(persistenceHookCode.includes('saveTrackEntityStateToDb(activeTextId, trackEntityScopedKey, next[trackEntityScopedKey]!)')).toBe(true);
  });

  it('clears explicit focus target safely by forcing mode back to all', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/useSpeakerFocusController.ts');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code.includes('const normalized = speakerKey.trim();')).toBe(true);
    expect(code.includes('if (normalized.length === 0) {')).toBe(true);
    expect(code.includes('setSpeakerFocusTargetForCurrentMedia(null);')).toBe(true);
    expect(code.includes("setSpeakerFocusMode('all');")).toBe(true);
  });

  it('keeps assistant sidebar assembly outside orchestrator inline glue', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const controllerPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionAssistantSidebarController.ts');
    const controllerCode = fs.readFileSync(controllerPath, 'utf8');
    const summaryPath = path.resolve(process.cwd(), 'src/pages/transcriptionAssistantStatusSummary.ts');
    const summaryCode = fs.readFileSync(summaryPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionAssistantSidebarController } from './useTranscriptionAssistantSidebarController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionAssistantSidebarController({')).toBe(true);
    expect(orchestratorCode.includes("import { useAiChatContextValue } from '../hooks/useAiChatContextValue';")).toBe(false);
    expect(orchestratorCode.includes("import { useTranscriptionRuntimeProps } from './useTranscriptionRuntimeProps';")).toBe(false);
    expect(orchestratorCode.includes('observerRecommendationsForSidebar')).toBe(false);
    expect(orchestratorCode.includes('analysisTab,')).toBe(true);
    expect(orchestratorCode.includes('onAnalysisTabChange: setAnalysisTab,')).toBe(true);

    expect(controllerCode.includes('function normalizeAssistantSidebarObserverRecommendation(')).toBe(true);
    expect(controllerCode.includes('const observerRecommendations = useMemo(')).toBe(true);
    expect(controllerCode.includes('const aiChatContextValue = useAiChatContextValue({')).toBe(true);
    expect(controllerCode.includes('const runtimeProps = useTranscriptionRuntimeProps(input.runtimePropsInput);')).toBe(true);
    expect(controllerCode.includes('const assistantRuntimeProps = useMemo<TranscriptionPageAssistantRuntimeProps>(() => ({')).toBe(true);
    expect(controllerCode.includes('const analysisPanelProps = useMemo<TranscriptionPageAnalysisPanelProps>(() => ({')).toBe(true);
    expect(controllerCode.includes('const analysisRuntimeProps = useMemo<TranscriptionPageAnalysisRuntimeProps>(() => ({')).toBe(true);
    expect(summaryCode.includes('export function buildTranscriptionAssistantStatusSummary(')).toBe(true);
  });

  it('keeps action ref wiring behind a dedicated hook boundary', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionActionRefBindings.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionActionRefBindings } from './useTranscriptionActionRefBindings';")).toBe(true);
    expect(orchestratorCode.includes('useTranscriptionActionRefBindings({')).toBe(true);
    expect(orchestratorCode.includes('waveformInteractionHandlerRefs.handleWaveformRegionUpdateEndRef.current = handleWaveformRegionUpdateEnd;')).toBe(false);
    expect(orchestratorCode.includes('executeActionRef.current = executeAction;')).toBe(false);
    expect(orchestratorCode.includes('openSearchRef.current = openSearchFromRequest;')).toBe(false);

    expect(hookCode.includes('input.waveformInteractionHandlerRefs.handleWaveformRegionUpdateEndRef.current = input.handleWaveformRegionUpdateEnd;')).toBe(true);
    expect(hookCode.includes('input.executeActionRef.current = input.executeAction;')).toBe(true);
    expect(hookCode.includes('input.openSearchRef.current = input.openSearchFromRequest;')).toBe(true);
  });

  it('keeps waveform region routing for independent-boundary layers', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');
    const waveformBridgeHookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionWaveformBridgeController.ts');
    const waveformBridgeHookCode = fs.readFileSync(waveformBridgeHookPath, 'utf8');

    const segmentBridgeHookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSegmentBridgeController.ts');
    const segmentBridgeHookCode = fs.readFileSync(segmentBridgeHookPath, 'utf8');

    expect(code.includes("import { useTranscriptionSegmentBridgeController } from './useTranscriptionSegmentBridgeController';")).toBe(true);
    expect(code.includes('} = useTranscriptionSegmentBridgeController({')).toBe(true);
    expect(segmentBridgeHookCode.includes("import { resolveTranscriptionTargetLayerId } from './transcriptionUnitTargetResolver';")).toBe(true);
    expect(segmentBridgeHookCode.includes('const activeLayerIdForEdits = useMemo(() => resolveTranscriptionTargetLayerId({')).toBe(true);
    expect(segmentBridgeHookCode.includes('selectedLayerId: input.selectedLayerId,')).toBe(true);
    expect(segmentBridgeHookCode.includes('focusedLayerId: input.focusedLayerId,')).toBe(true);
    expect(segmentBridgeHookCode.includes('selectedTimelineUnitLayerId: input.selectedTimelineUnit?.layerId,')).toBe(true);
    expect(segmentBridgeHookCode.includes('defaultTranscriptionLayerId: input.defaultTranscriptionLayerId,')).toBe(true);
    expect(segmentBridgeHookCode.includes('firstTranscriptionLayerId: input.firstTranscriptionLayerId,')).toBe(true);
    const hookPath = path.resolve(process.cwd(), 'src/pages/useWaveformSelectionController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');
    const interactionHookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionTimelineInteractionController.ts');
    const interactionHookCode = fs.readFileSync(interactionHookPath, 'utf8');

    // 独立层启用时，波形 region 来源应切到 layer_segments
    // When independent layer is active, waveform regions should come from layer_segments.
    expect(code.includes("import { useTranscriptionWaveformBridgeController } from './useTranscriptionWaveformBridgeController';")).toBe(true);
    expect(code.includes('} = useTranscriptionWaveformBridgeController({')).toBe(true);
    expect(code.includes("import { useWaveformSelectionController } from './useWaveformSelectionController';")).toBe(false);
    expect(waveformBridgeHookCode.includes("import { useWaveformSelectionController } from './useWaveformSelectionController';")).toBe(true);
    expect(waveformBridgeHookCode.includes('} = useWaveformSelectionController({')).toBe(true);
    expect(waveformBridgeHookCode.includes('const player = useWaveSurfer({')).toBe(true);
    expect(waveformBridgeHookCode.includes('} = useLasso({')).toBe(true);
    expect(waveformBridgeHookCode.includes('const { rulerView, zoomToPercent, zoomToUtterance } = useZoom({')).toBe(true);
    expect(hookCode.includes('const useSegmentWaveformRegions = Boolean(activeWaveformSegmentSourceLayer);')).toBe(true);
    expect(hookCode.includes('const waveformTimelineItems = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const segments = segmentsByLayer.get(activeWaveformSegmentSourceLayer.id) ?? [];')).toBe(true);
    expect(hookCode.includes('const waveformRegions = useMemo(() =>')).toBe(true);

    // 选择态应按 independent/utterance 双路径路由
    // Selection state must route by independent/utterance mode.
    expect(hookCode.includes('const selectedWaveformRegionId = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const kindMatchesWaveform = useSegmentWaveformRegions')).toBe(true);
    expect(hookCode.includes('return waveformTimelineItems.some((item) => item.id === selectedTimelineUnit.unitId)')).toBe(true);
    expect(hookCode.includes('const waveformActiveRegionIds = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('return selectedWaveformRegionId ? new Set([selectedWaveformRegionId]) : new Set<string>();')).toBe(true);
    expect(hookCode.includes('const waveformPrimaryRegionId = selectedWaveformRegionId;')).toBe(true);
    expect(hookCode.includes('const selectedWaveformTimelineItem = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('return waveformTimelineItems.find((item) => item.id === selectedWaveformRegionId) ?? null;')).toBe(true);

    // 拖拽更新结束应在独立层更新 segment 而非 utterance
    // Region update end must update segment on independent layers.
    expect(code.includes("import { useTranscriptionTimelineInteractionController } from './useTranscriptionTimelineInteractionController';")).toBe(true);
    expect(code.includes('useTranscriptionActionRefBindings({')).toBe(true);
    expect(interactionHookCode.includes('await LayerSegmentationV2Service.updateSegment(regionId, {')).toBe(true);
    expect(code.includes('!selectedMediaIsVideo && selectedWaveformTimelineItem && player.isReady')).toBe(true);

    // 批量入口已下沉到独立 controller，当前文件只保留调用边界
    // Batch mapping/error surfacing now lives in a dedicated controller hook.
    expect(code.includes("import { useBatchOperationController } from './useBatchOperationController';")).toBe(true);
    expect(code.includes('} = useBatchOperationController({')).toBe(true);
  });

  it('keeps workspace layout state behind a dedicated controller boundary', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionWorkspaceLayoutController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionWorkspaceLayoutController } from './useTranscriptionWorkspaceLayoutController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionWorkspaceLayoutController({')).toBe(true);

    expect(hookCode.includes("const [laneLabelWidth, setLaneLabelWidth] = useState<number>(() => readStoredClampedNumber('jieyu:lane-label-width', 40, 180, 64));")).toBe(true);
    expect(hookCode.includes('const handleLaneLabelWidthResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {')).toBe(true);
    expect(hookCode.includes("const [videoLayoutMode, setVideoLayoutMode] = useState<VideoLayoutMode>(() => readStoredVideoLayoutMode());")).toBe(true);
    expect(hookCode.includes('const handleVideoRightPanelResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {')).toBe(true);
    expect(hookCode.includes("if (hasMod && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'f') {")).toBe(true);
    expect(hookCode.includes("localStorage.setItem('jieyu:lane-heights', JSON.stringify(timelineLaneHeights));")).toBe(true);
  });

  it('persists focused speaker metadata on newly created independent segments', () => {
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSegmentCreationController.ts');
    const code = fs.readFileSync(hookPath, 'utf8');

    expect(code.includes('...(input.speakerFocusTargetKey ? { speakerId: input.speakerFocusTargetKey } : {}),')).toBe(true);
    expect(code.includes('if (!newSeg.speakerId && overlappingUtt.speakerId) {')).toBe(true);
    expect(code.includes('newSeg.speakerId = overlappingUtt.speakerId;')).toBe(true);
  });

  it('binds time-subdivision segments back to their parent utterance', () => {
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSegmentCreationController.ts');
    const code = fs.readFileSync(hookPath, 'utf8');

    expect(code.includes('newSeg.utteranceId = parentUtt.id;')).toBe(true);
    expect(code.includes('createSegmentWithParentConstraint(')).toBe(true);
  });

  it('pushes undo for segment creation only after creation guards pass', () => {
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSegmentCreationController.ts');
    const code = fs.readFileSync(hookPath, 'utf8');

    const timeSubdivisionPushUndoIndex = code.indexOf("pushUndo('新建句段');");
    const independentPushUndoIndex = code.lastIndexOf("pushUndo('新建句段');");
    const parentGuardIndex = code.indexOf("if (!parentUtt) {");

    expect(timeSubdivisionPushUndoIndex).toBeGreaterThan(parentGuardIndex);
    expect(independentPushUndoIndex).toBeGreaterThan(parentGuardIndex);
  });

  it('allows creating independent segments without preselecting speaker', () => {
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSegmentCreationController.ts');
    const code = fs.readFileSync(hookPath, 'utf8');

    expect(code.includes('当前独立层新建语段需要先选择说话人')).toBe(false);
    expect(code.includes('await LayerSegmentationV2Service.createSegment(newSeg);')).toBe(true);
  });

  it('keeps segment creation routing extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSegmentCreationController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionSegmentCreationController } from './useTranscriptionSegmentCreationController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionSegmentCreationController({')).toBe(true);
    expect(orchestratorCode.includes('const createUtteranceFromSelectionRouted = useCallback(async (start: number, end: number) => {')).toBe(false);

    expect(hookCode.includes('export function useTranscriptionSegmentCreationController(')).toBe(true);
    expect(hookCode.includes('const createUtteranceFromSelectionRouted = useCallback(async (start: number, end: number) => {')).toBe(true);
    expect(hookCode.includes('await input.createUtteranceFromSelection(start, end, {')).toBe(true);
  });

  it('keeps segment mutation routing extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSegmentMutationController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionSegmentMutationController({')).toBe(true);
    expect(orchestratorCode.includes('const splitRouted = useCallback(async (id: string, splitTime: number) => {')).toBe(false);
    expect(orchestratorCode.includes('const mergeWithPreviousRouted = useCallback(async (id: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const mergeWithNextRouted = useCallback(async (id: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const deleteUtteranceRouted = useCallback(async (id: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const deleteSelectedUtterancesRouted = useCallback(async (ids: Set<string>) => {')).toBe(false);

    expect(hookCode.includes('export function useTranscriptionSegmentMutationController(')).toBe(true);
    expect(hookCode.includes('const splitRouted = useCallback(async (id: string, splitTime: number, layerIdOverride?: string) => {')).toBe(true);
    expect(hookCode.includes('const mergeWithPreviousRouted = useCallback(async (id: string, layerIdOverride?: string) => {')).toBe(true);
    expect(hookCode.includes('const mergeWithNextRouted = useCallback(async (id: string, layerIdOverride?: string) => {')).toBe(true);
    expect(hookCode.includes('const deleteUtteranceRouted = useCallback(async (id: string, layerIdOverride?: string) => {')).toBe(true);
    expect(hookCode.includes('const deleteSelectedUtterancesRouted = useCallback(async (ids: Set<string>, layerIdOverride?: string) => {')).toBe(true);
  });

  it('keeps direct segment graph mutation service calls out of Orchestrator', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');

    // 允许仅剩的 segment content 写路径暂时留在页面层；segment graph mutation 必须留在 dedicated controllers。
    // Allow the remaining segment content write path for now; segment graph mutations must stay in dedicated controllers.
    const bridgeHookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSegmentBridgeController.ts');
    const bridgeHookCode = fs.readFileSync(bridgeHookPath, 'utf8');

    expect(orchestratorCode.includes('LayerSegmentationV2Service.deleteSegmentContent(')).toBe(false);
    expect(orchestratorCode.includes('LayerSegmentationV2Service.upsertSegmentContent(')).toBe(false);
    expect(bridgeHookCode.includes('LayerSegmentationV2Service.deleteSegmentContent(')).toBe(true);
    expect(bridgeHookCode.includes('LayerSegmentationV2Service.upsertSegmentContent(')).toBe(true);

    expect(orchestratorCode.includes('LayerSegmentationV2Service.createSegment(')).toBe(false);
    expect(orchestratorCode.includes('LayerSegmentationV2Service.createSegmentWithParentConstraint(')).toBe(false);
    expect(orchestratorCode.includes('LayerSegmentationV2Service.splitSegment(')).toBe(false);
    expect(orchestratorCode.includes('LayerSegmentationV2Service.mergeAdjacentSegments(')).toBe(false);
    expect(orchestratorCode.includes('LayerSegmentationV2Service.deleteSegment(')).toBe(false);
    expect(orchestratorCode.includes('LayerSegmentationV2Service.updateSegment(')).toBe(false);
  });

  it('keeps overlay action routing extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionOverlayActionRoutingController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionOverlayActionRoutingController } from './useTranscriptionOverlayActionRoutingController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionOverlayActionRoutingController({')).toBe(true);
    expect(orchestratorCode.includes('const runOverlayDeleteSelection = (')).toBe(false);
    expect(orchestratorCode.includes('const runOverlaySplitAtTime = (')).toBe(false);

    expect(hookCode.includes("if (unitKind === 'segment') {")).toBe(true);
    expect(hookCode.includes('fireAndForget(deleteSelectedUtterancesRouted(ids, layerId));')).toBe(true);
    expect(hookCode.includes('runMergeSelection(ids);')).toBe(true);
    expect(hookCode.includes('fireAndForget(splitRouted(id, splitTime, layerId));')).toBe(true);
  });

  it('keeps Orchestrator below the current regression ceiling', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const lineCount = orchestratorCode.split('\n').length;
    const useCallbackCount = (orchestratorCode.match(/const\s+\w+\s*=\s*useCallback\(/g) ?? []).length;

    expect(lineCount).toBeLessThanOrEqual(2600);
    expect(useCallbackCount).toBeLessThanOrEqual(8);
  });

  it('routes speaker assignment through segment writes for independent selections', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const scopeHookPath = path.resolve(process.cwd(), 'src/pages/useSpeakerActionScopeController.ts');
    const scopeHookCode = fs.readFileSync(scopeHookPath, 'utf8');
    const speakerControllerPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSpeakerController.ts');
    const speakerControllerCode = fs.readFileSync(speakerControllerPath, 'utf8');
    const routingHookPath = path.resolve(process.cwd(), 'src/pages/useSpeakerActionRoutingController.ts');
    const routingHookCode = fs.readFileSync(routingHookPath, 'utf8');

    expect(orchestratorCode.includes("import { useSpeakerActionScopeController } from './useSpeakerActionScopeController';")).toBe(true);
    expect(orchestratorCode.includes("import { useTranscriptionSpeakerController } from './useTranscriptionSpeakerController';")).toBe(true);
    expect(orchestratorCode.includes("import { useSpeakerActionRoutingController } from './useSpeakerActionRoutingController';")).toBe(false);
    expect(orchestratorCode.includes('} = useSpeakerActionScopeController({')).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionSpeakerController({')).toBe(true);
    expect(orchestratorCode.includes('const selectedSegmentIdsForSpeakerActions = useMemo(')).toBe(false);
    expect(orchestratorCode.includes('const handleAssignSpeakerToSegments = useCallback(async (segmentIds: Iterable<string>, speakerId?: string) => {')).toBe(false);
    expect(orchestratorCode.includes('handleAssignSpeakerToSelected: handleAssignSpeakerToSelectedRouted,')).toBe(true);
    expect(orchestratorCode.includes('onAssignSpeakerFromMenu={handleAssignSpeakerFromMenu}')).toBe(true);
    expect(orchestratorCode.includes('onOpenSpeakerManagementPanelFromMenu={() => handleOpenSpeakerManagementPanel()}')).toBe(true);

    expect(scopeHookCode.includes('const speakerActionUtteranceIdByUnitId = useMemo(() => {')).toBe(true);
    expect(scopeHookCode.includes('const selectedBatchSegmentsForSpeakerActions = useMemo(')).toBe(true);
    expect(scopeHookCode.includes('const resolveSpeakerActionUtteranceIds = useCallback((ids: Iterable<string>) => {')).toBe(true);

    expect(speakerControllerCode.includes("import { useSpeakerActionRoutingController } from './useSpeakerActionRoutingController';")).toBe(true);
    expect(speakerControllerCode.includes('} = useSpeakerActionRoutingController({')).toBe(true);
    expect(speakerControllerCode.includes('const handleAssignSpeakerFromMenu = useCallback((unitIds: Iterable<string>, kind: TimelineUnitKind, speakerId?: string) => {')).toBe(true);
    expect(speakerControllerCode.includes("if (kind === 'segment') {")).toBe(true);
    expect(speakerControllerCode.includes('fireAndForget(handleAssignSpeakerToSegments(Array.from(unitIds), speakerId));')).toBe(true);
    expect(speakerControllerCode.includes('fireAndForget(handleAssignSpeakerToUtterances(resolveSpeakerActionUtteranceIds(unitIds), speakerId));')).toBe(true);

    expect(routingHookCode.includes('const handleAssignSpeakerToSegments = useCallback(async (segmentIds: Iterable<string>, speakerId?: string) => {')).toBe(true);
    expect(routingHookCode.includes('await LinguisticService.assignSpeakerToSegments(targetIds, speakerId);')).toBe(true);
    expect(routingHookCode.includes('const createSpeakerAndAssignToSegments = useCallback(async (name: string, segmentIds: Iterable<string>) => {')).toBe(true);
  });

  it('keeps mixed segment and utterance speaker routing intact', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const routingHookPath = path.resolve(process.cwd(), 'src/pages/useSpeakerActionRoutingController.ts');
    const routingHookCode = fs.readFileSync(routingHookPath, 'utf8');

    expect(orchestratorCode.includes('const selectedStandaloneUtteranceIdsForSpeakerActions = useMemo(')).toBe(false);
    expect(orchestratorCode.includes('const applySpeakerToMixedSelection = useCallback(async (speakerId?: string) => {')).toBe(false);

    expect(routingHookCode.includes('const selectedStandaloneUtteranceIdsForSpeakerActions = useMemo(')).toBe(true);
    expect(routingHookCode.includes('selectedBatchSegmentsForSpeakerActions.length + selectedStandaloneUtteranceIdsForSpeakerActions.length')).toBe(true);
    expect(routingHookCode.includes('const applySpeakerToMixedSelection = useCallback(async (speakerId?: string) => {')).toBe(true);
    expect(routingHookCode.includes('if (selectedBatchSegmentsForSpeakerActions.length > 0 && selectedStandaloneUtteranceIdsForSpeakerActions.length > 0) {')).toBe(true);
    expect(routingHookCode.includes('await applySpeakerToMixedSelection(batchSpeakerId || undefined);')).toBe(true);
  });

  it('does not render the removed floating speaker assign panel', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code.includes("import { SpeakerAssignPanel } from '../components/transcription/SpeakerAssignPanel';")).toBe(false);
    expect(code.includes('<SpeakerAssignPanel')).toBe(false);
  });

  it('limits segment speaker management actions to explicit segment speaker labels', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const scopeHookPath = path.resolve(process.cwd(), 'src/pages/useSpeakerActionScopeController.ts');
    const scopeHookCode = fs.readFileSync(scopeHookPath, 'utf8');
    const routingHookPath = path.resolve(process.cwd(), 'src/pages/useSpeakerActionRoutingController.ts');
    const routingHookCode = fs.readFileSync(routingHookPath, 'utf8');

    expect(orchestratorCode.includes("import { useSpeakerActionScopeController } from './useSpeakerActionScopeController';")).toBe(true);
    expect(scopeHookCode.includes("const resolveExplicitSpeakerKeyForSegment = useCallback(")).toBe(true);
    expect(scopeHookCode.includes("speakerKey: resolveExplicitSpeakerKeyForSegment(segment),")).toBe(true);
    expect(routingHookCode.includes(".filter((segment) => resolveExplicitSpeakerKeyForSegment(segment) === speakerKey)")).toBe(true);
  });

  it('keeps runtime props composition extracted into dedicated hook', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');
    const sidebarControllerPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionAssistantSidebarController.ts');
    const sidebarControllerCode = fs.readFileSync(sidebarControllerPath, 'utf8');
    const selectionSnapshotHookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSelectionSnapshot.ts');
    const selectionSnapshotHookCode = fs.readFileSync(selectionSnapshotHookPath, 'utf8');
    const selectionSnapshotPath = path.resolve(process.cwd(), 'src/pages/transcriptionSelectionSnapshot.ts');
    const selectionSnapshotCode = fs.readFileSync(selectionSnapshotPath, 'utf8');

    expect(code.includes("import { useTranscriptionAssistantSidebarController } from './useTranscriptionAssistantSidebarController';")).toBe(true);
    expect(code.includes("import { useTranscriptionSelectionSnapshot } from './useTranscriptionSelectionSnapshot';")).toBe(true);
    expect(code.includes('const selectionSnapshot = useTranscriptionSelectionSnapshot({')).toBe(true);
    expect(code.includes('} = useTranscriptionAssistantSidebarController({')).toBe(true);
    expect(code.includes('createAssistantRuntimeProps({')).toBe(false);
    expect(code.includes('createAnalysisRuntimeProps({')).toBe(false);
    expect(code.includes('createPdfRuntimeProps({')).toBe(false);
    expect(sidebarControllerCode.includes('const runtimeProps = useTranscriptionRuntimeProps(input.runtimePropsInput);')).toBe(true);
    expect(selectionSnapshotHookCode.includes("import { useMemo } from 'react';")).toBe(true);
    expect(selectionSnapshotHookCode.includes('return useMemo(() => buildTranscriptionSelectionSnapshot(input), [')).toBe(true);
    expect(selectionSnapshotCode.includes('export function buildTranscriptionSelectionSnapshot(')).toBe(true);
  });

  it('keeps section view-model assembly extracted from orchestrator JSX', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSectionViewModels.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');
    const sidebarHookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSidebarSectionsViewModel.ts');
    const sidebarHookCode = fs.readFileSync(sidebarHookPath, 'utf8');
    const aiSidebarPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.AiSidebar.tsx');
    const aiSidebarCode = fs.readFileSync(aiSidebarPath, 'utf8');
    const assistantRuntimePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.AssistantRuntime.tsx');
    const assistantRuntimeCode = fs.readFileSync(assistantRuntimePath, 'utf8');
    const analysisRuntimePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.AnalysisRuntime.tsx');
    const analysisRuntimeCode = fs.readFileSync(analysisRuntimePath, 'utf8');
    const pdfRuntimePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.PdfRuntime.tsx');
    const pdfRuntimeCode = fs.readFileSync(pdfRuntimePath, 'utf8');
    const runtimeContractsPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.runtimeContracts.ts');
    const runtimeContractsCode = fs.readFileSync(runtimeContractsPath, 'utf8');
    const timelineContentHookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionTimelineContentViewModel.ts');
    const timelineContentHookCode = fs.readFileSync(timelineContentHookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionSectionViewModels } from './useTranscriptionSectionViewModels';")).toBe(true);
    expect(orchestratorCode.includes("sidebarSectionsInput: {")).toBe(true);
    expect(orchestratorCode.includes("import { useTranscriptionTimelineContentViewModel } from './useTranscriptionTimelineContentViewModel';")).toBe(true);
    expect(orchestratorCode.includes('const timelineContentViewModel = useTranscriptionTimelineContentViewModel({')).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionSectionViewModels({')).toBe(true);
    expect(orchestratorCode.includes('<TranscriptionPageToolbar {...toolbarProps} />')).toBe(true);
    expect(orchestratorCode.includes('<TranscriptionPageTimelineTop {...timelineTopProps} />')).toBe(true);
    expect(orchestratorCode.includes('<TranscriptionPageTimelineContent {...timelineContentProps} />')).toBe(true);
    expect(orchestratorCode.includes('<TranscriptionPageAiSidebar {...aiSidebarProps} />')).toBe(true);
    expect(orchestratorCode.includes('<TranscriptionPageDialogs {...dialogsProps} />')).toBe(true);
    expect(orchestratorCode.includes('lowConfidenceCount,')).toBe(false);
    expect(orchestratorCode.includes('aiChatContextValue,')).toBe(false);
    expect(orchestratorCode.includes('headerProps={{')).toBe(false);
    expect(orchestratorCode.includes('mediaLanesProps: {')).toBe(false);
    expect(orchestratorCode.includes('textOnlyProps: {')).toBe(false);
    expect(orchestratorCode.includes('speakerDialogState={speakerDialogStateRouted}')).toBe(false);

    expect(hookCode.includes('const toolbarProps = useMemo<TranscriptionPageToolbarProps>(() => ({')).toBe(true);
    expect(hookCode.includes('const lowConfidenceCount = useMemo(() => utterancesOnCurrentMedia.filter(')).toBe(true);
    expect(hookCode.includes('const timelineTopProps = useMemo<TranscriptionPageTimelineTopProps>(() => ({')).toBe(true);
    expect(hookCode.includes('return {\n    toolbarProps,\n    timelineTopProps,\n    timelineContentProps,\n    aiSidebarProps,\n    dialogsProps,\n  };')).toBe(true);
    expect(hookCode.includes("import {\n  useTranscriptionSidebarSectionsViewModel,")).toBe(true);
    expect(hookCode.includes('const { aiSidebarProps, dialogsProps } = useTranscriptionSidebarSectionsViewModel(sidebarSectionsInput);')).toBe(true);

  expect(sidebarHookCode.includes('const aiSidebarProps = useMemo<TranscriptionPageAiSidebarProps>(() => ({')).toBe(true);
  expect(sidebarHookCode.includes('assistantRuntimeProps.aiChatContextValue.aiPendingToolCall')).toBe(true);
  expect(sidebarHookCode.includes('countAssistantAttentionSignals({')).toBe(true);
  expect(sidebarHookCode.includes("setHubSidebarTab('assistant');")).toBe(true);
  expect(sidebarHookCode.includes('const dialogsProps = useMemo<TranscriptionPageDialogsProps>(() => ({')).toBe(true);
  expect(aiSidebarCode.includes('<AssistantRuntime {...assistantRuntimeProps} />')).toBe(true);
  expect(aiSidebarCode.includes('<AnalysisRuntime {...analysisRuntimeProps} />')).toBe(true);
  expect(aiSidebarCode.includes('analysisTab={analysisTab}')).toBe(false);
  expect(aiSidebarCode.includes('aiChatContextValue={aiChatContextValue}')).toBe(false);
  expect(assistantRuntimeCode.includes("from './TranscriptionPage.runtimeContracts';")).toBe(true);
  expect(assistantRuntimeCode.includes('frame: TranscriptionPageAssistantRuntimeFrameProps;')).toBe(true);
  expect(assistantRuntimeCode.includes('voice: TranscriptionPageAssistantRuntimeVoiceProps;')).toBe(true);
  expect(runtimeContractsCode.includes('context: TranscriptionPageAssistantRuntimeVoiceContextProps;')).toBe(true);
  expect(runtimeContractsCode.includes('actions: TranscriptionPageAssistantRuntimeVoiceActionProps;')).toBe(true);
  expect(runtimeContractsCode.includes('intent: TranscriptionPageAssistantRuntimeVoiceIntentProps;')).toBe(true);
  expect(runtimeContractsCode.includes('writeback: TranscriptionPageAssistantRuntimeVoiceWritebackProps;')).toBe(true);
  expect(runtimeContractsCode.includes('lifecycle: TranscriptionPageAssistantRuntimeVoiceLifecycleProps;')).toBe(true);
  expect(runtimeContractsCode.includes('target: TranscriptionPageAssistantRuntimeVoiceTargetProps;')).toBe(true);
  expect(assistantRuntimeCode.includes('voice.actions.lifecycle.onRegisterToggleVoice(')).toBe(true);
  expect(assistantRuntimeCode.includes('voice.actions.intent.executeAction')).toBe(true);
  expect(assistantRuntimeCode.includes('voice.actions.writeback.handleVoiceDictation')).toBe(true);
  expect(assistantRuntimeCode.includes('voice.context.getActiveTextPrimaryLanguageId')).toBe(true);
  expect(assistantRuntimeCode.includes('selection: voice.target.selection,')).toBe(true);
  expect(assistantRuntimeCode.includes('frame={frame}')).toBe(true);
  expect(analysisRuntimeCode.includes("from './TranscriptionPage.runtimeContracts';")).toBe(true);
   expect(runtimeContractsCode.includes('embedding: TranscriptionPageAnalysisEmbeddingProps;')).toBe(true);
  expect(runtimeContractsCode.includes('panel: TranscriptionPageAnalysisPanelProps;')).toBe(true);
  expect(runtimeContractsCode.includes('source: TranscriptionPageAnalysisEmbeddingSourceProps;')).toBe(true);
  expect(runtimeContractsCode.includes('navigation: TranscriptionPageAnalysisEmbeddingNavigationProps;')).toBe(true);
  expect(runtimeContractsCode.includes('provider: TranscriptionPageAnalysisEmbeddingProviderProps;')).toBe(true);
  expect(runtimeContractsCode.includes('config: TranscriptionPageAnalysisEmbeddingProviderConfigProps;')).toBe(true);
  expect(runtimeContractsCode.includes('actions: TranscriptionPageAnalysisEmbeddingProviderActionProps;')).toBe(true);
  expect(analysisRuntimeCode.includes('activeTab={panel.analysisTab}')).toBe(true);
  expect(analysisRuntimeCode.includes('locale: panel.locale,')).toBe(true);
  expect(analysisRuntimeCode.includes('selectedUtterance: embedding.source.selectedUtterance,')).toBe(true);
  expect(analysisRuntimeCode.includes('embedding.provider.config.embeddingProviderConfig')).toBe(true);
  expect(analysisRuntimeCode.includes('onJumpToCitation: embedding.navigation.onJumpToCitation,')).toBe(true);
  expect(pdfRuntimeCode.includes("from './TranscriptionPage.runtimeContracts';")).toBe(true);
  expect(runtimeContractsCode.includes('previewRequest: TranscriptionPagePdfRuntimeRequestProps;')).toBe(true);
  expect(pdfRuntimeCode.includes('const { request, onCloseRequest } = previewRequest;')).toBe(true);
  expect(pdfRuntimeCode.includes('onCloseRequest?.();')).toBe(true);

    expect(timelineContentHookCode.includes('const mediaLanesProps = useMemo<TranscriptionPageTimelineMediaLanesProps>(() => ({')).toBe(true);
    expect(timelineContentHookCode.includes('const textOnlyProps = useMemo<TranscriptionPageTimelineTextOnlyProps>(() => input.textOnlyPropsInput')).toBe(true);
    expect(timelineContentHookCode.includes('const emptyStateProps = useMemo<TranscriptionPageTimelineEmptyStateProps>(() => ({')).toBe(true);
    expect(timelineContentHookCode.includes('return useMemo<TranscriptionPageTimelineContentProps>(() => ({')).toBe(true);
  });

  it('keeps assistant callbacks and AI panel context extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionAssistantController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionAssistantController } from './useTranscriptionAssistantController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionAssistantController({')).toBe(true);
    expect(orchestratorCode.includes('const handleVoiceDictation = useCallback((text: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const handleVoiceAnalysisResult = useCallback(async (utteranceId: string | null, analysisText: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const aiPanelContextValue = useMemo(() => ({')).toBe(false);

    expect(hookCode.includes('const aiPanelContextValue = useMemo<AiPanelContextValue>(() => ({')).toBe(true);
    expect(hookCode.includes('const handleResolveVoiceIntentWithLlm = useCallback(async ({')).toBe(true);
    expect(hookCode.includes('const handleVoiceDictation = useCallback((text: string) => {')).toBe(true);
    expect(hookCode.includes('const persistAndAdvance = async (persist: () => Promise<void>) => {')).toBe(true);
    expect(hookCode.includes('const handleVoiceAnalysisResult = useCallback(async (utteranceId: string | null, analysisText: string) => {')).toBe(true);
    expect(hookCode.includes('input.setAiPanelContext(aiPanelContextValue);')).toBe(true);
  });

  it('keeps recovery banner actions behind the dedicated hook boundary', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/hooks/useRecoveryBanner.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useRecoveryBanner } from '../hooks/useRecoveryBanner';")).toBe(true);
    expect(orchestratorCode.includes('} = useRecoveryBanner({')).toBe(true);
    expect(orchestratorCode.includes('onApply={applyRecoveryBanner}')).toBe(true);
    expect(orchestratorCode.includes('onDismiss={dismissRecoveryBanner}')).toBe(true);
    expect(orchestratorCode.includes('const snap = recoveryDataRef.current;')).toBe(false);
    expect(orchestratorCode.includes('fireAndForget((async () => {')).toBe(false);

    expect(hookCode.includes('const applyRecoveryBanner = useCallback((): void => {')).toBe(true);
    expect(hookCode.includes('const dismissRecoveryBanner = useCallback((): void => {')).toBe(true);
    expect(hookCode.includes('if (ok) hideRecoveryBanner();')).toBe(true);
  });

  it('keeps timeline filtering and editor context composition extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionTimelineController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionTimelineController } from './useTranscriptionTimelineController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionTimelineController({')).toBe(true);
    expect(orchestratorCode.includes('const filteredUtterancesOnCurrentMedia = useMemo(() => {')).toBe(false);
    expect(orchestratorCode.includes('const timelineRenderUtterances = useMemo(() => {')).toBe(false);
    expect(orchestratorCode.includes('const translationAudioByLayer = useMemo(() => {')).toBe(false);
    expect(orchestratorCode.includes('const editorContextValue = useMemo(() => ({')).toBe(false);

    expect(hookCode.includes('const filteredUtterancesOnCurrentMedia = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const timelineRenderUtterances = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const translationAudioByLayer = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const selectedBatchUtteranceTextById = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const batchPreviewTextByLayerId = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const editorContextValue = useMemo<TranscriptionEditorContextValue>(() => ({')).toBe(true);
  });

  it('keeps timeline interaction routing extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionTimelineInteractionController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionTimelineInteractionController } from './useTranscriptionTimelineInteractionController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionTimelineInteractionController({')).toBe(true);
    expect(orchestratorCode.includes('const handleJumpToEmbeddingMatch = useCallback((utteranceId: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const handleJumpToCitation = useCallback(async (')).toBe(false);
    expect(orchestratorCode.includes('const handleSearchReplace = useCallback(')).toBe(false);
    expect(orchestratorCode.includes('const getNeighborBoundsRouted = useCallback((itemId: string, mediaId: string | undefined, probeStart: number, layerId?: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const saveTimingRouted = useCallback(async (id: string, start: number, end: number, layerId?: string) => {')).toBe(false);
    expect(orchestratorCode.includes('setSubSelectionRange(null);')).toBe(false);
    expect(orchestratorCode.includes('fireAndForget(createUtteranceFromSelectionRouted(start, end));')).toBe(false);
    expect(orchestratorCode.includes('subSelectDragRef.current = { active: false, regionId, anchorTime: time, pointerId };')).toBe(false);
    expect(orchestratorCode.includes('handleWaveformRegionContextMenuRef.current = handleWaveformRegionContextMenu;')).toBe(false);
    expect(orchestratorCode.includes('handleWaveformRegionAltPointerDownRef.current = handleWaveformRegionAltPointerDown;')).toBe(false);
    expect(orchestratorCode.includes('beginTimingGesture(regionId);')).toBe(false);
    expect(orchestratorCode.includes('const snapped = snapToZeroCrossing(buf, start, end);')).toBe(false);
    expect(orchestratorCode.includes('const arr = waveformTimelineItems;')).toBe(false);
    expect(orchestratorCode.includes('handleWaveformRegionClickRef.current = handleWaveformRegionClick;')).toBe(false);
    expect(orchestratorCode.includes('handleWaveformRegionDoubleClickRef.current = handleWaveformRegionDoubleClick;')).toBe(false);
    expect(orchestratorCode.includes('handleWaveformRegionCreateRef.current = handleWaveformRegionCreate;')).toBe(false);
    expect(orchestratorCode.includes('handleWaveformRegionUpdateRef.current = handleWaveformRegionUpdate;')).toBe(false);
    expect(orchestratorCode.includes('handleWaveformRegionUpdateEndRef.current = handleWaveformRegionUpdateEnd;')).toBe(false);
    expect(orchestratorCode.includes('handleWaveformTimeUpdateRef.current = handleWaveformTimeUpdate;')).toBe(false);

    expect(hookCode.includes('const handleSearchReplace = useCallback((utteranceId: string, layerId: string | undefined, _oldText: string, newText: string) => {')).toBe(true);
    expect(hookCode.includes('const handleJumpToEmbeddingMatch = useCallback((utteranceId: string) => {')).toBe(true);
    expect(hookCode.includes('const handleJumpToCitation = useCallback(async (')).toBe(true);
    expect(hookCode.includes('const handleSplitAtTimeRequest = useCallback((timeSeconds: number) => {')).toBe(true);
    expect(hookCode.includes('const handleZoomToSegmentRequest = useCallback((segmentId: string, zoomLevel?: number) => {')).toBe(true);
    expect(hookCode.includes('const getNeighborBoundsRouted = useCallback((itemId: string, mediaId: string | undefined, probeStart: number, layerId?: string) => {')).toBe(true);
    expect(hookCode.includes('const saveTimingRouted = useCallback(async (id: string, start: number, end: number, layerId?: string) => {')).toBe(true);
    expect(hookCode.includes('const handleWaveformRegionContextMenu = useCallback((regionId: string, x: number, y: number) => {')).toBe(true);
    expect(hookCode.includes('const handleWaveformRegionAltPointerDown = useCallback((regionId: string, time: number, pointerId: number, _clientX: number) => {')).toBe(true);
    expect(hookCode.includes('const handleWaveformRegionClick = useCallback((regionId: string, clickTime: number, event: MouseEvent) => {')).toBe(true);
    expect(hookCode.includes('const handleWaveformRegionDoubleClick = useCallback((_regionId: string, start: number, end: number) => {')).toBe(true);
    expect(hookCode.includes('const handleWaveformRegionCreate = useCallback((start: number, end: number) => {')).toBe(true);
    expect(hookCode.includes('const handleWaveformRegionUpdate = useCallback((regionId: string, start: number, end: number) => {')).toBe(true);
    expect(hookCode.includes('const handleWaveformRegionUpdateEnd = useCallback((regionId: string, start: number, end: number) => {')).toBe(true);
    expect(hookCode.includes('const handleWaveformTimeUpdate = useCallback((time: number) => {')).toBe(true);
  });

  it('keeps batch operation controller extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useBatchOperationController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useBatchOperationController } from './useBatchOperationController';")).toBe(true);
    expect(orchestratorCode.includes('} = useBatchOperationController({')).toBe(true);
    expect(orchestratorCode.includes('const resolveBatchUtteranceTargetIds = useCallback(() => {')).toBe(false);
    expect(orchestratorCode.includes('const handleBatchOffset = useCallback(async (deltaSec: number) => {')).toBe(false);

    expect(hookCode.includes('const batchUtteranceSelectionMapping = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const resolveBatchUtteranceTargetIds = useCallback(() => {')).toBe(true);
    expect(hookCode.includes("message: '当前选中的语段无法映射到可编辑句段，请先选择可编辑句段后再试。'")).toBe(true);
    expect(hookCode.includes('已忽略 ${batchUtteranceSelectionMapping.unmappedSourceCount} 个不可映射选中项')).toBe(true);
    expect(hookCode.includes('const runMappedBatchAction = useCallback(async (actionLabel: string, i18nKey: string, action: BatchOperationSelectionAction) => {')).toBe(true);
  });

  it('keeps track display controller extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTrackDisplayController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTrackDisplayController } from './useTrackDisplayController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTrackDisplayController({')).toBe(true);
    expect(orchestratorCode.includes('const hasOverlappingUtterancesOnCurrentMedia = useMemo(')).toBe(false);
    expect(orchestratorCode.includes('const handleResetTrackAutoLayout = useCallback(() => {')).toBe(false);

    expect(hookCode.includes('function hasOverlaps(items: OverlapLike[]): boolean {')).toBe(true);
    expect(hookCode.includes('const effectiveLaneLockMap = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const handleResetTrackAutoLayout = useCallback(() => {')).toBe(true);
    expect(hookCode.includes('const trackLockDiagnostics = useMemo(() => {')).toBe(true);
  });

  it('keeps waveform runtime controller extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useWaveformRuntimeController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useWaveformRuntimeController } from './useWaveformRuntimeController';")).toBe(true);
    expect(orchestratorCode.includes('} = useWaveformRuntimeController();')).toBe(true);
    expect(orchestratorCode.includes('const handleWaveformResizeStart = useCallback(')).toBe(false);

    expect(hookCode.includes("localStorage.setItem('jieyu:waveform-height'")).toBe(true);
    expect(hookCode.includes("localStorage.setItem('jieyu:amplitude-scale'")).toBe(true);
    expect(hookCode.includes('setIsResizingWaveform(true);')).toBe(true);
  });

  it('keeps voice dictation write-then-auto-advance flow inside assistant controller', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionAssistantController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    const selectionHookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSelectionContextController.ts');
    const selectionHookCode = fs.readFileSync(selectionHookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionSelectionContextController } from './useTranscriptionSelectionContextController';")).toBe(true);
    expect(orchestratorCode.includes('nextUtteranceIdForVoiceDictation,')).toBe(true);
    expect(selectionHookCode.includes("import { resolveNextUtteranceIdForDictation } from './voiceDictationFlow';")).toBe(true);
    expect(selectionHookCode.includes('const nextUtteranceIdForVoiceDictation = useMemo(() => resolveNextUtteranceIdForDictation({')).toBe(true);
    expect(hookCode.includes('const persistAndAdvance = async (persist: () => Promise<void>) => {')).toBe(true);
    expect(hookCode.includes('if (!input.nextUtteranceIdForVoiceDictation) return;')).toBe(true);
    expect(hookCode.includes('input.selectUtterance(input.nextUtteranceIdForVoiceDictation);')).toBe(true);
  });
});
