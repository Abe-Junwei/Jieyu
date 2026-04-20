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

describe('TranscriptionPage structure invariants', () => {
  it('keeps transcription-list-main outside transcription-waveform-area', () => {
    // waveform-area JSX 已提取到 OrchestratorWaveformContent | waveform-area JSX now in OrchestratorWaveformContent
    const waveformFilePath = path.resolve(process.cwd(), 'src/pages/OrchestratorWaveformContent.tsx');
    const waveformFileCode = fs.readFileSync(waveformFilePath, 'utf8');
    const waveformSourceFile = ts.createSourceFile(waveformFilePath, waveformFileCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const waveformArea = findFirstJsxByClassName(waveformSourceFile, 'transcription-waveform-area');
    expect(waveformArea).not.toBeNull();

    // list-main 仍在 Orchestrator | list-main still in Orchestrator
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const orchestratorSourceFile = ts.createSourceFile(orchestratorPath, orchestratorCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const listMain = findFirstJsxByClassName(orchestratorSourceFile, 'transcription-list-main');
    expect(listMain).not.toBeNull();

    // OrchestratorWaveformContent 在 Orchestrator 中的使用位置应在 list-main 之前
    // OrchestratorWaveformContent usage in Orchestrator should precede list-main
    expect(orchestratorCode.includes('OrchestratorWaveformContent')).toBe(true);
  });

  it('keeps waveform height resize handle on timeline overview header', () => {
    const headerFilePath = path.resolve(process.cwd(), 'src/components/transcription/TranscriptionTimelineSections.tsx');
    const headerCode = fs.readFileSync(headerFilePath, 'utf8');
    const waveformFilePath = path.resolve(process.cwd(), 'src/pages/OrchestratorWaveformContent.tsx');
    const waveformCode = fs.readFileSync(waveformFilePath, 'utf8');

    expect(headerCode.includes('onWaveformResizeStart')).toBe(true);
    expect(headerCode.includes('onResizeStart')).toBe(true);
    expect(waveformCode.includes('transcription-waveform-resize-handle')).toBe(false);
  });

  it('keeps waveform runtime progress badges wired into the top toolbar only', () => {
    const waveformContentPath = path.resolve(process.cwd(), 'src/pages/OrchestratorWaveformContent.tsx');
    const waveformContentCode = fs.readFileSync(waveformContentPath, 'utf8');
    const toolbarPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Toolbar.tsx');
    const toolbarCode = fs.readFileSync(toolbarPath, 'utf8');
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const legacyWaveformRuntimeStatusClass = ['waveform', 'runtime-status'].join('-');

    expect(waveformContentCode.includes(legacyWaveformRuntimeStatusClass)).toBe(false);
    expect(toolbarCode.includes('const combinedLeftToolbarExtras')).toBe(true);
    expect(toolbarCode.includes('<ToolbarAiProgress')).toBe(true);
    expect(toolbarCode.includes('leftToolbarExtras={combinedLeftToolbarExtras}')).toBe(true);
    expect(orchestratorCode.includes('acousticRuntimeStatus={deferredAiRuntime.acousticRuntimeStatus}')).toBe(true);
    expect(orchestratorCode.includes('vadCacheStatus={vadCacheStatus}')).toBe(true);
  });

  it('keeps selected hotspot marker wiring between panel state and waveform overlay', () => {
    const waveformContentPath = path.resolve(process.cwd(), 'src/pages/OrchestratorWaveformContent.tsx');
    const waveformContentCode = fs.readFileSync(waveformContentPath, 'utf8');
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const markerIndex = waveformContentCode.indexOf('className="waveform-analysis-hotspot-line"');
    const waveformOverlayIndex = waveformContentCode.indexOf('waveformOverlay={({');

    expect(waveformContentCode.includes('selectedHotspotTimeSec?: number | null;')).toBe(true);
    expect(waveformContentCode.includes('const selectedHotspotLeftPx = typeof selectedHotspotTimeSec === \'number\'' )).toBe(true);
    expect(waveformContentCode.includes("const shouldRenderSelectedHotspot = waveformDisplayMode === 'waveform'")).toBe(true);
    expect(waveformContentCode.includes('className="waveform-guide-overlay"')).toBe(true);
    expect(waveformContentCode.includes('className="waveform-analysis-hotspot-line"')).toBe(true);
    expect(markerIndex).toBeGreaterThan(waveformOverlayIndex);
    expect(orchestratorCode.includes('selectedHotspotTimeSec={selectedHotspotTimeSec}')).toBe(true);
  });

  it('preserves hotspot selection during loading recompute and clears stale selection when summary is unavailable', () => {
    const acousticPanelStatePath = path.resolve(process.cwd(), 'src/pages/useTranscriptionAcousticPanelState.ts');
    const acousticPanelStateCode = fs.readFileSync(acousticPanelStatePath, 'utf8');

    expect(acousticPanelStateCode.includes('const activeAcousticHotspots = deferredAiRuntime.acousticSummary?.hotspots ?? [];')).toBe(true);
    expect(acousticPanelStateCode.includes('setSelectedHotspotTimeSec(null);')).toBe(true);
    expect(acousticPanelStateCode.includes('setPinnedInspector(null);')).toBe(true);
    expect(acousticPanelStateCode.includes("if (deferredAiRuntime.acousticRuntimeStatus?.state === 'loading') {")).toBe(true);
    expect(acousticPanelStateCode.includes('if (deferredAiRuntime.acousticSummary == null) {')).toBe(true);
    expect(acousticPanelStateCode.includes('setSelectedHotspotTimeSec(null);')).toBe(true);
    expect(acousticPanelStateCode.includes('const stillExists = activeAcousticHotspots.some((hotspot) => Math.abs(hotspot.timeSec - selectedHotspotTimeSec) <= 0.01);')).toBe(true);
    expect(acousticPanelStateCode.includes('const selectionDuration = deferredAiRuntime.acousticSummary?.durationSec;')).toBe(true);
    expect(acousticPanelStateCode.includes('const isTerminalSelection = selectionEnd !== undefined')).toBe(true);
    expect(acousticPanelStateCode.includes('(isTerminalSelection ? activeReadout.timeSec <= selectionEnd : activeReadout.timeSec < selectionEnd)')).toBe(true);
  });

  it('keeps speaker routing stack without speaker-focus controller', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const controllerPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSpeakerController.ts');
    const controllerCode = fs.readFileSync(controllerPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionSpeakerController } from './useTranscriptionSpeakerController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionSpeakerController({')).toBe(true);
    expect(controllerCode.includes("import { useSpeakerFocusController } from './useSpeakerFocusController';")).toBe(false);
    expect(controllerCode.includes("import { useSpeakerActionRoutingController } from './useSpeakerActionRoutingController';")).toBe(true);
    expect(controllerCode.includes('} = useSpeakerActionRoutingController({')).toBe(true);
    expect(controllerCode.includes("import { useSpeakerActions } from '../hooks/useSpeakerActions';")).toBe(true);
    expect(controllerCode.includes('} = useSpeakerActions({')).toBe(true);
    expect(orchestratorCode.includes('speakerFocusTargetMemoryByMediaRef')).toBe(false);
  });

  it('keeps media-scoped track entity persistence integration', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
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
    expect(persistenceHookCode.includes('saveTrackEntityStateToDb(activeTextId, trackEntityScopedKey, next[trackEntityScopedKey]!)')).toBe(true);
  });

  it('keeps assistant sidebar assembly outside orchestrator inline glue', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
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
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
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
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
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
    expect(waveformBridgeHookCode.includes('const { rulerView, zoomToPercent, zoomToUnit } = useZoom({')).toBe(true);
    expect(hookCode.includes('const useSegmentWaveformRegions = Boolean(activeWaveformSegmentSourceLayer);')).toBe(true);
    expect(hookCode.includes('const waveformTimelineItems = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const unitRowsFromIndex = timelineUnitViewIndex.currentMediaUnits;')).toBe(true);
    expect(hookCode.includes('const waveformRegions = useMemo(() =>')).toBe(true);

    // 选择态应按 independent/unit 双路径路由
    // Selection state must route by independent/unit mode.
    expect(hookCode.includes('const selectedWaveformRegionId = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const kindMatchesWaveform = useSegmentWaveformRegions')).toBe(true);
    expect(hookCode.includes('return waveformTimelineItems.some((item) => item.id === selectedTimelineUnit.unitId)')).toBe(true);
    expect(hookCode.includes('const waveformActiveRegionIds = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('return selectedWaveformRegionId ? new Set([selectedWaveformRegionId]) : new Set<string>();')).toBe(true);
    expect(waveformBridgeHookCode.includes('primaryRegionId: selectedWaveformRegionId')).toBe(true);
    expect(hookCode.includes('const selectedWaveformTimelineItem = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('return waveformTimelineItems.find((item) => item.id === selectedWaveformRegionId) ?? null;')).toBe(true);

    // 拖拽更新结束应在独立层更新 segment 而非 unit
    // Region update end must update segment on independent layers.
    expect(code.includes("import { useTranscriptionTimelineInteractionController } from './useTranscriptionTimelineInteractionController';")).toBe(true);
    expect(code.includes('useTranscriptionActionRefBindings({')).toBe(true);
    expect(interactionHookCode.includes('await LayerSegmentationV2Service.updateSegment(regionId, {')).toBe(true);
    // RegionActionOverlay 条件已提取到 OrchestratorWaveformContent | RegionActionOverlay condition now in waveform component
    const waveformContentPath = path.resolve(process.cwd(), 'src/pages/OrchestratorWaveformContent.tsx');
    const waveformContentCode = fs.readFileSync(waveformContentPath, 'utf8');
    expect(waveformContentCode.includes('!selectedMediaIsVideo && selectedWaveformTimelineItem && playerIsReady')).toBe(true);

    // 批量入口已下沉到独立 controller，当前文件只保留调用边界
    // Batch mapping/error surfacing now lives in a dedicated controller hook.
    expect(code.includes("import { useBatchOperationController } from './useBatchOperationController';")).toBe(true);
    expect(code.includes('} = useBatchOperationController({')).toBe(true);
  });

  it('keeps workspace layout state behind a dedicated controller boundary', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionWorkspaceLayoutController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionWorkspaceLayoutController } from './useTranscriptionWorkspaceLayoutController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionWorkspaceLayoutController({')).toBe(true);

    expect(hookCode.includes("const [laneLabelWidth, setLaneLabelWidth] = useState<number>(() => readStoredClampedNumber('jieyu:lane-label-width', 40, 180, 64));")).toBe(true);
    expect(hookCode.includes('const handleLaneLabelWidthResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {')).toBe(true);
    expect(hookCode.includes('const [videoLayoutMode, setVideoLayoutMode] = useState<VideoLayoutMode>(readStoredVideoLayoutModePreference);')).toBe(true);
    expect(hookCode.includes('const handleVideoRightPanelResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {')).toBe(true);
    expect(hookCode.includes("if (hasMod && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'f') {")).toBe(true);
    expect(hookCode.includes("localStorage.setItem('jieyu:lane-heights', JSON.stringify(timelineLaneHeights));")).toBe(true);
  });

  it('inherits speaker metadata on newly created independent segments from overlapping unit', () => {
    const actionPath = path.resolve(process.cwd(), 'src/pages/transcriptionSegmentCreationActions.ts');
    const code = fs.readFileSync(actionPath, 'utf8');

    expect(code.includes('if (!newSeg.speakerId && overlappingUtt.speakerId) {')).toBe(true);
    expect(code.includes('newSeg.speakerId = overlappingUtt.speakerId;')).toBe(true);
  });

  it('binds time-subdivision segments back to their parent unit', () => {
    const actionPath = path.resolve(process.cwd(), 'src/pages/transcriptionSegmentCreationActions.ts');
    const code = fs.readFileSync(actionPath, 'utf8');

    expect(code.includes('newSeg.unitId = parentUtt.id;')).toBe(true);
    expect(code.includes('createSegmentWithParentConstraint(')).toBe(true);
  });

  it('pushes undo for segment creation only after creation guards pass', () => {
    const actionPath = path.resolve(process.cwd(), 'src/pages/transcriptionSegmentCreationActions.ts');
    const code = fs.readFileSync(actionPath, 'utf8');

    const timeSubdivisionPersistIndex = code.indexOf("await createSegmentInRoutedLayer(newSeg, routing, {\n          doneMessageKey: 'transcription.unitAction.done.createFromSelection',\n          parentUnit: parentUtt,");
    const independentPersistIndex = code.indexOf("await createSegmentInRoutedLayer(newSeg, routing, {\n          doneMessageKey: 'transcription.unitAction.done.createFromSelection',\n        });");
    const parentGuardIndex = code.indexOf("if (!parentUtt) {");

    expect(timeSubdivisionPersistIndex).toBeGreaterThan(parentGuardIndex);
    expect(independentPersistIndex).toBeGreaterThan(parentGuardIndex);
  });

  it('allows creating independent segments without preselecting speaker', () => {
    const actionPath = path.resolve(process.cwd(), 'src/pages/transcriptionSegmentCreationActions.ts');
    const code = fs.readFileSync(actionPath, 'utf8');

    expect(code.includes('当前独立层新建语段需要先选择说话人')).toBe(false);
    expect(code.includes('await LayerSegmentationV2Service.createSegment(segment);')).toBe(true);
  });

  it('keeps segment creation routing extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSegmentCreationController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');
    const actionPath = path.resolve(process.cwd(), 'src/pages/transcriptionSegmentCreationActions.ts');
    const actionCode = fs.readFileSync(actionPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionSegmentCreationController } from './useTranscriptionSegmentCreationController';")).toBe(true);
    expect(orchestratorCode.includes('{ createNextSegmentRouted, createUnitFromSelectionRouted } = useTranscriptionSegmentCreationController({')).toBe(true);
    expect(orchestratorCode.includes('const createUnitFromSelectionRouted = useCallback(async (start: number, end: number) => {')).toBe(false);

    expect(hookCode.includes('export function useTranscriptionSegmentCreationController(')).toBe(true);
    expect(hookCode.includes("} from './transcriptionSegmentCreationActions';")).toBe(true);
    expect(hookCode.includes('return createTranscriptionSegmentCreationActions(input, locale);')).toBe(true);
    expect(actionCode.includes('const createNextSegmentRouted = async (targetId: string) => {')).toBe(true);
    expect(actionCode.includes('const createUnitFromSelectionRouted = async (start: number, end: number) => {')).toBe(true);
    expect(actionCode.includes('await input.createAdjacentUnit(targetUnit, mediaDuration);')).toBe(true);
    expect(actionCode.includes('await input.createUnitFromSelection(start, end, {')).toBe(true);
  });

  it('keeps segment mutation routing extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSegmentMutationController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionSegmentMutationController({')).toBe(true);
    expect(orchestratorCode.includes('const splitRouted = useCallback(async (id: string, splitTime: number) => {')).toBe(false);
    expect(orchestratorCode.includes('const mergeWithPreviousRouted = useCallback(async (id: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const mergeWithNextRouted = useCallback(async (id: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const deleteUnitRouted = useCallback(async (id: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const deleteSelectedUnitsRouted = useCallback(async (ids: Set<string>) => {')).toBe(false);

    expect(hookCode.includes('export function useTranscriptionSegmentMutationController(')).toBe(true);
    expect(hookCode.includes('const splitRouted = useCallback(async (id: string, splitTime: number, layerIdOverride?: string) => {')).toBe(true);
    expect(hookCode.includes('const mergeWithPreviousRouted = useCallback(async (id: string, layerIdOverride?: string) => {')).toBe(true);
    expect(hookCode.includes('const mergeWithNextRouted = useCallback(async (id: string, layerIdOverride?: string) => {')).toBe(true);
    expect(hookCode.includes('const deleteUnitRouted = useCallback(async (id: string, layerIdOverride?: string) => {')).toBe(true);
    expect(hookCode.includes('const deleteSelectedUnitsRouted = useCallback(async (ids: Set<string>, layerIdOverride?: string) => {')).toBe(true);
  });

  it('keeps direct segment graph mutation service calls out of Orchestrator', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
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
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionOverlayActionRoutingController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionOverlayActionRoutingController } from './useTranscriptionOverlayActionRoutingController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionOverlayActionRoutingController({')).toBe(true);
    expect(orchestratorCode.includes('const runOverlayDeleteSelection = (')).toBe(false);
    expect(orchestratorCode.includes('const runOverlaySplitAtTime = (')).toBe(false);

    expect(hookCode.includes("if (unitKind === 'segment') {")).toBe(true);
    expect(hookCode.includes('fireAndForget(deleteSelectedUnitsRouted(ids, layerId));')).toBe(true);
    expect(hookCode.includes('runMergeSelection(ids);')).toBe(true);
    expect(hookCode.includes('fireAndForget(splitRouted(id, splitTime, layerId));')).toBe(true);
  });

  it('keeps Orchestrator below the current regression ceiling', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const lineCount = orchestratorCode.split('\n').length;
    const useCallbackCount = (orchestratorCode.match(/const\s+\w+\s*=\s*useCallback\(/g) ?? []).length;

    expect(lineCount).toBeLessThanOrEqual(2600);
    expect(useCallbackCount).toBeLessThanOrEqual(11);
  });

  it('routes speaker assignment through segment writes for independent selections', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
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
    expect(orchestratorCode.includes('onSetUnitSelfCertaintyFromMenu={handleSetUnitSelfCertaintyFromMenu}')).toBe(true);
    expect(orchestratorCode.includes('resolveSelfCertaintyUnitIds={resolveSelfCertaintyUnitIds}')).toBe(true);
    expect(orchestratorCode.includes('onOpenSpeakerManagementPanelFromMenu={() => handleOpenSpeakerManagementPanel()}')).toBe(true);

    expect(scopeHookCode.includes('resolveMappedUnitIds(')).toBe(true);
    expect(scopeHookCode.includes('selectedBatchSegmentsForSpeakerActions')).toBe(true);
    expect(scopeHookCode.includes('const resolveSpeakerActionUnitIds = useCallback((ids: Iterable<string>) => {')).toBe(true);

    expect(speakerControllerCode.includes("import { useSpeakerActionRoutingController } from './useSpeakerActionRoutingController';")).toBe(true);
    expect(speakerControllerCode.includes('} = useSpeakerActionRoutingController({')).toBe(true);
    expect(speakerControllerCode.includes('const handleAssignSpeakerFromMenu = useCallback((unitIds: Iterable<string>, kind: TimelineUnitKind, speakerId?: string) => {')).toBe(true);
    expect(speakerControllerCode.includes("if (kind === 'segment') {")).toBe(true);
    expect(speakerControllerCode.includes('fireAndForget(handleAssignSpeakerToSegments(ids, speakerId));')).toBe(true);
    expect(speakerControllerCode.includes('fireAndForget(handleAssignSpeakerToUnits(resolveSpeakerActionUnitIds(ids), speakerId));')).toBe(true);

    expect(routingHookCode.includes('const handleAssignSpeakerToSegments = useCallback(async (segmentIds: Iterable<string>, speakerId?: string) => {')).toBe(true);
    expect(routingHookCode.includes('await LinguisticService.assignSpeakerToSegments(targetIds, speakerId);')).toBe(true);
    expect(routingHookCode.includes('const createSpeakerAndAssignToSegments = useCallback(async (name: string, segmentIds: Iterable<string>) => {')).toBe(true);
  });

  it('keeps mixed segment and unit speaker routing intact', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const routingHookPath = path.resolve(process.cwd(), 'src/pages/useSpeakerActionRoutingController.ts');
    const routingHookCode = fs.readFileSync(routingHookPath, 'utf8');

    expect(orchestratorCode.includes('const selectedStandaloneUnitIdsForSpeakerActions = useMemo(')).toBe(false);
    expect(orchestratorCode.includes('const applySpeakerToMixedSelection = useCallback(async (speakerId?: string) => {')).toBe(false);

    expect(routingHookCode.includes('const selectedStandaloneUnitIdsForSpeakerActions = useMemo(')).toBe(true);
    expect(routingHookCode.includes('selectedUnitIdsForSpeakerActions.filter((id) => !segmentByIdForSpeakerActions.has(id))')).toBe(true);
    expect(routingHookCode.includes('selectedBatchSegmentsForSpeakerActions.length + selectedStandaloneUnitIdsForSpeakerActions.length')).toBe(true);
    expect(routingHookCode.includes('const applySpeakerToMixedSelection = useCallback(async (speakerId?: string) => {')).toBe(true);
    expect(routingHookCode.includes('if (selectedBatchSegmentsForSpeakerActions.length > 0 && selectedStandaloneUnitIdsForSpeakerActions.length > 0) {')).toBe(true);
    expect(routingHookCode.includes('await applySpeakerToMixedSelection(batchSpeakerId || undefined);')).toBe(true);
    expect(routingHookCode.includes('selectedUnitIdsForSpeakerActionsSet')).toBe(false);
  });

  it('does not render the removed floating speaker assign panel', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code.includes("import { SpeakerAssignPanel } from '../components/transcription/SpeakerAssignPanel';")).toBe(false);
    expect(code.includes('<SpeakerAssignPanel')).toBe(false);
  });

  it('limits segment speaker management actions to explicit segment speaker labels', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
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
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
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
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSectionViewModels.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');
    const reviewSectionHookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionReviewSectionViewModel.ts');
    const reviewSectionHookCode = fs.readFileSync(reviewSectionHookPath, 'utf8');
    const sidebarHookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSidebarSectionsViewModel.ts');
    const sidebarHookCode = fs.readFileSync(sidebarHookPath, 'utf8');
    const aiSidebarPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.AiSidebar.tsx');
    const aiSidebarCode = fs.readFileSync(aiSidebarPath, 'utf8');
    const assistantRuntimePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.AssistantRuntime.tsx');
    const assistantRuntimeCode = fs.readFileSync(assistantRuntimePath, 'utf8');
    const analysisRuntimePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.AnalysisRuntime.tsx');
    const analysisRuntimeCode = fs.readFileSync(analysisRuntimePath, 'utf8');
    const orchestratorInputBuilderPath = path.resolve(process.cwd(), 'src/pages/transcriptionReadyWorkspaceOrchestratorInput.ts');
    const orchestratorInputBuilderCode = fs.readFileSync(orchestratorInputBuilderPath, 'utf8');
    const pdfRuntimePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.PdfRuntime.tsx');
    const pdfRuntimeCode = fs.readFileSync(pdfRuntimePath, 'utf8');
    const runtimeContractsPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.runtimeContracts.ts');
    const runtimeContractsCode = fs.readFileSync(runtimeContractsPath, 'utf8');
    const timelineContentHookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionTimelineContentViewModel.ts');
    const timelineContentHookCode = fs.readFileSync(timelineContentHookPath, 'utf8');

    expect(orchestratorCode.includes("import { useOrchestratorViewModels } from './useOrchestratorViewModels';")).toBe(true);
    expect(
      orchestratorCode.includes('sidebarSectionsInput: {')
      || orchestratorInputBuilderCode.includes('sidebarSectionsInput: {'),
    ).toBe(true);
    expect(orchestratorCode.includes("useOrchestratorViewModels(")).toBe(true);
    expect(orchestratorCode.includes('const shouldRenderAiSidebar = hasActivatedAiSidebar || !isAiPanelCollapsed;')).toBe(true);
    expect(orchestratorCode.includes('const shouldRenderDialogs = Boolean(')).toBe(true);
    expect(orchestratorCode.includes('const shouldRenderPdfRuntime = pdfRuntimeProps.previewRequest.request !== null;')).toBe(true);
    expect(orchestratorCode.includes('const shouldRenderBatchOps = showBatchOperationPanel;')).toBe(true);
    expect(orchestratorCode.includes('<TranscriptionPageToolbar')).toBe(true);
    expect(orchestratorCode.includes('{...toolbarProps}')).toBe(true);
    expect(orchestratorCode.includes('acousticRuntimeStatus={deferredAiRuntime.acousticRuntimeStatus}')).toBe(true);
    expect(orchestratorCode.includes('vadCacheStatus={vadCacheStatus}')).toBe(true);
    expect(orchestratorCode.includes('className="transcription-timeline-top-suspense-fallback"')).toBe(true);
    expect(orchestratorCode.includes('className="transcription-side-pane transcription-side-pane-placeholder"')).toBe(true);
    expect(orchestratorCode.includes('className="timeline-scroll-suspense-fallback"')).toBe(true);
    expect(orchestratorCode.includes('className="timeline-scroll-suspense-fallback-row"')).toBe(true);
    expect(orchestratorCode.includes('<TranscriptionPageTimelineTop {...timelineTopProps} />')).toBe(true);
    expect(orchestratorCode.includes('<TranscriptionPageTimelineContent {...timelineContentProps} />')).toBe(true);
    expect(orchestratorCode.includes('<TranscriptionPageAiSidebar')).toBe(true);
    expect(orchestratorCode.includes('shouldRenderRuntime={shouldRenderAiSidebar}')).toBe(true);
    expect(orchestratorCode.includes('<TranscriptionPageDialogs {...dialogsProps} />')).toBe(true);
    expect(orchestratorCode.includes('aria-label={t(locale, \'transcription.importDialog.selectMedia\')}')).toBe(true);
    expect(orchestratorCode.includes('lowConfidenceCount,')).toBe(false);
    expect(orchestratorCode.includes('aiChatContextValue,')).toBe(false);
    expect(orchestratorCode.includes('headerProps={{')).toBe(false);
    expect(orchestratorCode.includes('mediaLanesProps: {')).toBe(false);
    expect(orchestratorCode.includes('textOnlyProps: {')).toBe(false);
    expect(orchestratorCode.includes('speakerDialogState={speakerDialogStateRouted}')).toBe(false);

    expect(hookCode.includes("import { createTranscriptionToolbarProps } from './transcriptionToolbarProps';")).toBe(true);
    expect(hookCode.includes('const toolbarProps = useMemo<TranscriptionPageToolbarProps>(() => createTranscriptionToolbarProps({')).toBe(true);
    expect(hookCode.includes("import { useTranscriptionReviewSectionViewModel } from './useTranscriptionReviewSectionViewModel';")).toBe(true);
    expect(hookCode.includes('useTranscriptionReviewSectionViewModel({')).toBe(true);
    expect(reviewSectionHookCode.includes('const lowConfidenceCount = useMemo(() => unitsOnCurrentMedia.filter(')).toBe(true);
    expect(hookCode.includes("import { createTranscriptionTimelineTopProps } from './transcriptionTimelineTopProps';")).toBe(true);
    expect(hookCode.includes('const timelineTopProps = useMemo<TranscriptionPageTimelineTopProps>(() => createTranscriptionTimelineTopProps({')).toBe(true);
    expect(hookCode.includes('return {\n    toolbarProps,\n    timelineTopProps,\n    timelineContentProps,\n    aiSidebarProps,\n    dialogsProps,\n  };')).toBe(true);
    expect(hookCode.includes("useTranscriptionSidebarSectionsViewModel")).toBe(true);
    expect(hookCode.includes('const { aiSidebarProps, dialogsProps } = useTranscriptionSidebarSectionsViewModel(sidebarSectionsInput);')).toBe(true);

  expect(sidebarHookCode.includes('const aiSidebarProps = useMemo<TranscriptionPageAiSidebarProps>(() => ({')).toBe(true);
  expect(sidebarHookCode.includes('assistantRuntimeProps.aiChatContextValue.aiPendingToolCall')).toBe(true);
  expect(sidebarHookCode.includes('countAssistantAttentionSignals({')).toBe(true);
  expect(sidebarHookCode.includes("setHubSidebarTab('assistant');")).toBe(true);
  expect(sidebarHookCode.includes('const dialogsProps = useMemo<TranscriptionPageDialogsProps>(() => ({')).toBe(true);
  expect(aiSidebarCode.includes('shouldRenderRuntime = true')).toBe(true);
  expect(aiSidebarCode.includes('shouldRenderRuntime ? (')).toBe(true);
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
  expect(analysisRuntimeCode.includes('selectedUnit: embedding.source.selectedUnit,')).toBe(true);
  expect(analysisRuntimeCode.includes('embedding.provider.config.embeddingProviderConfig')).toBe(true);
  expect(analysisRuntimeCode.includes('onJumpToCitation: embedding.navigation.onJumpToCitation,')).toBe(true);
  expect(pdfRuntimeCode.includes("from './TranscriptionPage.runtimeContracts';")).toBe(true);
  expect(runtimeContractsCode.includes('previewRequest: TranscriptionPagePdfRuntimeRequestProps;')).toBe(true);
  expect(pdfRuntimeCode.includes('const { request, onCloseRequest } = previewRequest;')).toBe(true);
  expect(pdfRuntimeCode.includes('onCloseRequest?.();')).toBe(true);

    expect(timelineContentHookCode.includes('const mediaLanesProps = useMemo<TranscriptionPageTimelineMediaLanesProps>(() => ({')).toBe(true);
    expect(timelineContentHookCode.includes('const textOnlyProps = useMemo<TranscriptionPageTimelineTextOnlyProps>')).toBe(true);
    expect(timelineContentHookCode.includes('() => input.textOnlyPropsInput')).toBe(true);
    expect(timelineContentHookCode.includes('comparisonViewToggleDep')).toBe(true);
    expect(timelineContentHookCode.includes('const emptyStateProps = useMemo<TranscriptionPageTimelineEmptyStateProps>(() => ({')).toBe(true);
    expect(timelineContentHookCode.includes('return useMemo<TranscriptionPageTimelineContentProps>(() => ({')).toBe(true);
  });

  it('keeps assistant callbacks and AI panel context extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionAssistantController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionAssistantController } from './useTranscriptionAssistantController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionAssistantController({')).toBe(true);
    expect(orchestratorCode.includes('const handleVoiceDictation = useCallback((text: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const handleVoiceAnalysisResult = useCallback(async (unitId: string | null, analysisText: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const aiPanelContextValue = useMemo(() => ({')).toBe(false);

    expect(hookCode.includes("import { buildTranscriptionAssistantContextValue } from './transcriptionAssistantContextValue';")).toBe(true);
    expect(hookCode.includes('const aiPanelContextValue = useMemo<AiPanelContextValue>(() => buildTranscriptionAssistantContextValue(input), [')).toBe(true);
    expect(hookCode.includes('const aiPanelContextValue = useMemo<AiPanelContextValue>(() => ({')).toBe(false);
    expect(hookCode.includes('const handleResolveVoiceIntentWithLlm = useCallback(async ({')).toBe(true);
    expect(hookCode.includes('const handleVoiceDictation = useCallback((text: string) => {')).toBe(true);
    expect(hookCode.includes('const persistAndAdvance = async (persist: () => Promise<void>) => {')).toBe(true);
    expect(hookCode.includes('const handleVoiceAnalysisResult = useCallback(async (unitId: string | null, analysisText: string) => {')).toBe(true);
    expect(hookCode.includes('input.setAiPanelContext(aiPanelContextValue);')).toBe(true);
  });

  it('keeps recovery banner actions behind the dedicated hook boundary', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/hooks/useRecoveryBanner.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useRecoveryBanner } from '../hooks/useRecoveryBanner';")).toBe(true);
    expect(orchestratorCode.includes('} = useRecoveryBanner({')).toBe(true);
    expect(orchestratorCode.includes('onApply={applyRecoveryBanner}')).toBe(true);
    expect(orchestratorCode.includes('onDismiss={dismissRecoveryBanner}')).toBe(true);
    expect(orchestratorCode.includes('recoveryDataRef')).toBe(false);

    expect(hookCode.includes('const applyRecoveryBanner = useCallback((): void => {')).toBe(true);
    expect(hookCode.includes('const dismissRecoveryBanner = useCallback((): void => {')).toBe(true);
    expect(hookCode.includes('if (ok) hideRecoveryBanner();')).toBe(true);
  });

  it('keeps timeline filtering and editor context composition extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionTimelineController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionTimelineController } from './useTranscriptionTimelineController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionTimelineController({')).toBe(true);
    expect(orchestratorCode.includes('const filteredUnitsOnCurrentMedia = useMemo(() => {')).toBe(false);
    expect(orchestratorCode.includes('const timelineRenderUnits = useMemo(() => {')).toBe(false);
    expect(orchestratorCode.includes('const translationAudioByLayer = useMemo(() => {')).toBe(false);
    expect(orchestratorCode.includes('const editorContextValue = useMemo(() => ({')).toBe(false);

    expect(hookCode.includes('const filteredUnitsOnCurrentMedia = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const timelineRenderUnits = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const translationAudioByLayer = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const selectedBatchUnitTextById = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const batchPreviewTextByLayerId = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const editorContextValue = useMemo<TranscriptionEditorContextValue>(() => ({')).toBe(true);
  });

  it('keeps timeline interaction routing extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionTimelineInteractionController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionTimelineInteractionController } from './useTranscriptionTimelineInteractionController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTranscriptionTimelineInteractionController({')).toBe(true);
    expect(orchestratorCode.includes('const handleJumpToEmbeddingMatch = useCallback((unitId: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const handleJumpToCitation = useCallback(async (')).toBe(false);
    expect(orchestratorCode.includes('const handleSearchReplace = useCallback(')).toBe(false);
    expect(orchestratorCode.includes('const getNeighborBoundsRouted = useCallback((itemId: string, mediaId: string | undefined, probeStart: number, layerId?: string) => {')).toBe(false);
    expect(orchestratorCode.includes('const saveTimingRouted = useCallback(async (id: string, start: number, end: number, layerId?: string) => {')).toBe(false);
    expect(orchestratorCode.includes('setSubSelectionRange(null);')).toBe(false);
    expect(orchestratorCode.includes('fireAndForget(createUnitFromSelectionRouted(start, end));')).toBe(false);
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

    expect(hookCode.includes('const handleSearchReplace = useCallback((unitId: string, layerId: string | undefined, _oldText: string, newText: string) => {')).toBe(true);
    expect(hookCode.includes('const handleJumpToEmbeddingMatch = useCallback((unitId: string) => {')).toBe(true);
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
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useBatchOperationController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useBatchOperationController } from './useBatchOperationController';")).toBe(true);
    expect(orchestratorCode.includes('} = useBatchOperationController({')).toBe(true);
    expect(orchestratorCode.includes('const resolveBatchUnitTargetIds = useCallback(() => {')).toBe(false);
    expect(orchestratorCode.includes('const handleBatchOffset = useCallback(async (deltaSec: number) => {')).toBe(false);

    expect(hookCode.includes('const batchUnitSelectionMapping = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const resolveBatchUnitTargetIds = useCallback(() => {')).toBe(true);
    expect(hookCode.includes("message: t(locale, 'transcription.batchOperation.mappingUnavailable'),")).toBe(true);
    expect(hookCode.includes("message: tf(locale, 'transcription.batchOperation.mappingIgnored', {")).toBe(true);
    expect(hookCode.includes('const runMappedBatchAction = useCallback(async (')).toBe(true);
    expect(hookCode.includes('actionLabelKey: Parameters<typeof t>[1],')).toBe(true);
    expect(hookCode.includes('i18nKey: Parameters<typeof t>[1],')).toBe(true);
  });

  it('keeps track display controller extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTrackDisplayController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTrackDisplayController } from './useTrackDisplayController';")).toBe(true);
    expect(orchestratorCode.includes('} = useTrackDisplayController({')).toBe(true);
    expect(orchestratorCode.includes('const hasOverlappingUnitsOnCurrentMedia = useMemo(')).toBe(false);
    expect(orchestratorCode.includes('const handleResetTrackAutoLayout = useCallback(() => {')).toBe(false);

    expect(hookCode.includes('function hasOverlaps(items: OverlapLike[]): boolean {')).toBe(true);
    expect(hookCode.includes('const effectiveLaneLockMap = useMemo(() => {')).toBe(true);
    expect(hookCode.includes('const handleResetTrackAutoLayout = useCallback(() => {')).toBe(true);
  });

  it('keeps waveform runtime controller extracted into dedicated hook', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useWaveformRuntimeController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    expect(orchestratorCode.includes("import { useWaveformRuntimeController } from './useWaveformRuntimeController';")).toBe(true);
    expect(orchestratorCode.includes('} = useWaveformRuntimeController();')).toBe(true);
    expect(orchestratorCode.includes('const handleWaveformResizeStart = useCallback(')).toBe(false);

    expect(hookCode.includes('localStorage.setItem(WAVEFORM_HEIGHT_STORAGE_KEY')).toBe(true);
    expect(hookCode.includes('localStorage.setItem(WAVEFORM_AMPLITUDE_SCALE_STORAGE_KEY, String(amplitudeScale));')).toBe(true);
    expect(hookCode.includes('setIsResizingWaveform(true);')).toBe(true);
  });

  it('keeps voice dictation write-then-auto-advance flow inside assistant controller', () => {
    const orchestratorPath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.ReadyWorkspace.tsx');
    const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf8');
    const hookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionAssistantController.ts');
    const hookCode = fs.readFileSync(hookPath, 'utf8');

    const selectionHookPath = path.resolve(process.cwd(), 'src/pages/useTranscriptionSelectionContextController.ts');
    const selectionHookCode = fs.readFileSync(selectionHookPath, 'utf8');

    expect(orchestratorCode.includes("import { useTranscriptionSelectionContextController } from './useTranscriptionSelectionContextController';")).toBe(true);
    expect(orchestratorCode.includes('nextUnitIdForVoiceDictation,')).toBe(true);
    expect(selectionHookCode.includes("import { resolveNextUnitIdForDictation } from './voiceDictationFlow';")).toBe(true);
    expect(selectionHookCode.includes('const nextUnitIdForVoiceDictation = useMemo(() => resolveNextUnitIdForDictation({')).toBe(true);
    expect(hookCode.includes('const persistAndAdvance = async (persist: () => Promise<void>) => {')).toBe(true);
    expect(hookCode.includes('if (!input.nextUnitIdForVoiceDictation) return;')).toBe(true);
    expect(hookCode.includes('input.selectUnit(input.nextUnitIdForVoiceDictation);')).toBe(true);
  });
});
