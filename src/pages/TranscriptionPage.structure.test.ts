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
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    // 媒体维度记忆映射存在 | Media-scoped memory map exists
    expect(code.includes('speakerFocusTargetMemoryByMediaRef')).toBe(true);
    // 以媒体 id 作为记忆键 | Uses media id as memory key
    expect(code.includes("const speakerFocusMediaKey = selectedUtteranceMedia?.id ?? '__no-media__';")).toBe(true);
    // 切换媒体时恢复记忆 | Restores memory on media switch
    expect(code.includes('const saved = speakerFocusTargetMemoryByMediaRef.current[speakerFocusMediaKey];')).toBe(true);
    expect(code.includes('setSpeakerFocusTargetKey(saved ?? null);')).toBe(true);
    // 更新聚焦目标时写回当前媒体记忆 | Persists selection back to current media memory
    expect(code.includes('speakerFocusTargetMemoryByMediaRef.current[speakerFocusMediaKey] = nextKey;')).toBe(true);
  });

  it('keeps speaker focus fallback guard for invalid explicit target', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    // 显式目标不在当前媒体可选集合时，解析为 null | Resolve to null when explicit target is not in current media options
    expect(code.includes('return speakerFocusOptionKeySet.has(speakerFocusTargetKey) ? speakerFocusTargetKey : null;')).toBe(true);
    // 检测到无效目标后回写清空，防止 focus-hard 全空白 | Clear invalid explicit target to avoid focus-hard blank state
    expect(code.includes('if (speakerFocusOptionKeySet.has(speakerFocusTargetKey)) return;')).toBe(true);
    expect(code.includes('setSpeakerFocusTargetForCurrentMedia(null);')).toBe(true);
  });

  it('keeps media-scoped track entity persistence integration', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code.includes('trackEntityStateByMediaRef')).toBe(true);
    expect(code.includes('trackEntityHydratedKeyRef')).toBe(true);
    expect(code.includes('const trackEntityProjectKey = activeTextId?.trim() ||')).toBe(true);
    expect(code.includes("const trackEntityMediaId = selectedUtteranceMedia?.id ?? null;")).toBe(true);
    expect(code.includes('const trackEntityScopedKey = trackEntityMediaId ? `${trackEntityProjectKey}::${trackEntityMediaId}` : null;')).toBe(true);
    expect(code.includes('const trackEntityScopedKey = trackEntityMediaId ?')).toBe(true);
    expect(code.includes('if (!trackEntityScopedKey) {')).toBe(true);
    expect(code.includes('const saved = getTrackEntityState(trackEntityStateByMediaRef.current, trackEntityScopedKey);')).toBe(true);
    expect(code.includes('if (trackEntityHydratedKeyRef.current !== trackEntityScopedKey) return;')).toBe(true);
    expect(code.includes('saveTrackEntityStateMap(next')).toBe(true);
  });

  it('clears explicit focus target safely by forcing mode back to all', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code.includes('const normalized = speakerKey.trim();')).toBe(true);
    expect(code.includes('if (normalized.length === 0) {')).toBe(true);
    expect(code.includes('setSpeakerFocusTargetForCurrentMedia(null);')).toBe(true);
    expect(code.includes("setSpeakerFocusMode('all');")).toBe(true);
  });

  it('keeps waveform region routing for independent-boundary layers', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    // 独立层启用时，波形 region 来源应切到 layer_segments
    // When independent layer is active, waveform regions should come from layer_segments.
    expect(code.includes('const useIndependentWaveformRegions = Boolean(activeWaveformLayer && layerUsesOwnSegments(activeWaveformLayer, defaultTranscriptionLayerId));')).toBe(true);
    expect(code.includes('const waveformTimelineItems = useMemo(() => {')).toBe(true);
    expect(code.includes('const segments = segmentsByLayer.get(activeWaveformLayer.id) ?? [];')).toBe(true);
    expect(code.includes('const waveformRegions = useMemo(() =>')).toBe(true);

    // 选择态应按 independent/utterance 双路径路由
    // Selection state must route by independent/utterance mode.
    expect(code.includes('const selectedWaveformRegionId = selectedTimelineUnit?.layerId === activeLayerIdForEdits')).toBe(true);
    expect(code.includes("? (isSegmentTimelineUnit(selectedTimelineUnit) ? selectedTimelineUnit.unitId : '')")).toBe(true);
    expect(code.includes(": (isUtteranceTimelineUnit(selectedTimelineUnit) ? selectedTimelineUnit.unitId : '')")).toBe(true);
    expect(code.includes('const waveformActiveRegionIds = useMemo(() => {')).toBe(true);
    expect(code.includes('return selectedWaveformRegionId ? new Set([selectedWaveformRegionId]) : new Set<string>();')).toBe(true);
    expect(code.includes('const waveformPrimaryRegionId = selectedWaveformRegionId;')).toBe(true);

    // 拖拽更新结束应在独立层更新 segment 而非 utterance
    // Region update end must update segment on independent layers.
    expect(code.includes('if (useIndependentWaveformRegions && activeWaveformLayer) {')).toBe(true);
    expect(code.includes('await LayerSegmentationV2Service.updateSegment(regionId, {')).toBe(true);
  });

  it('persists focused speaker metadata on newly created independent segments', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code.includes('...(speakerFocusTargetKey ? { speakerId: speakerFocusTargetKey } : {}),')).toBe(true);
    expect(code.includes('if (!newSeg.speakerId && overlappingUtt.speakerId) {')).toBe(true);
    expect(code.includes('newSeg.speakerId = overlappingUtt.speakerId;')).toBe(true);
  });

  it('binds time-subdivision segments back to their parent utterance', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code.includes('newSeg.utteranceId = parentUtt.id;')).toBe(true);
    expect(code.includes('createSegmentWithParentConstraint(')).toBe(true);
  });

  it('pushes undo for segment creation only after creation guards pass', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    const timeSubdivisionPushUndoIndex = code.indexOf("pushUndo('新建句段');");
    const independentPushUndoIndex = code.lastIndexOf("pushUndo('新建句段');");
    const parentGuardIndex = code.indexOf("if (!parentUtt) {");

    expect(timeSubdivisionPushUndoIndex).toBeGreaterThan(parentGuardIndex);
    expect(independentPushUndoIndex).toBeGreaterThan(parentGuardIndex);
  });

  it('allows creating independent segments without preselecting speaker', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code.includes('当前独立层新建语段需要先选择说话人')).toBe(false);
    expect(code.includes('await LayerSegmentationV2Service.createSegment(newSeg);')).toBe(true);
  });

  it('routes speaker assignment through segment writes for independent selections', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code.includes('const selectedSegmentIdsForSpeakerActions = useMemo(')).toBe(true);
    expect(code.includes('const handleAssignSpeakerToSegments = useCallback(async (segmentIds: Iterable<string>, speakerId?: string) => {')).toBe(true);
    expect(code.includes('await LinguisticService.assignSpeakerToSegments(targetIds, speakerId);')).toBe(true);
    expect(code.includes('const createSpeakerAndAssignToSegments = useCallback(async (name: string, segmentIds: Iterable<string>) => {')).toBe(true);
    expect(code.includes('fireAndForget(handleAssignSpeakerToSegments(Array.from(unitIds), speakerId));')).toBe(true);
    expect(code.includes('onOpenSpeakerManagementPanelFromMenu={() => openSpeakerManagementPanel()}')).toBe(true);
    expect(code.includes('handleAssignSpeakerToSelected: handleAssignSpeakerToSelectedRouted,')).toBe(true);
  });

  it('keeps mixed segment and utterance speaker routing intact', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code.includes('const selectedStandaloneUtteranceIdsForSpeakerActions = useMemo(')).toBe(true);
    expect(code.includes('selectedSegmentIdsForSpeakerActions.length + selectedStandaloneUtteranceIdsForSpeakerActions.length')).toBe(true);
    expect(code.includes("selectedStandaloneUtteranceIdsForSpeakerActions.length > 0 ? 'mixed' : 'segment'")).toBe(true);
    expect(code.includes('const applySpeakerToMixedSelection = useCallback(async (speakerId?: string) => {')).toBe(true);
    expect(code.includes('await applySpeakerToMixedSelection(batchSpeakerId || undefined);')).toBe(true);
  });

  it('does not render the removed floating speaker assign panel', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code.includes("import { SpeakerAssignPanel } from '../components/transcription/SpeakerAssignPanel';")).toBe(false);
    expect(code.includes('<SpeakerAssignPanel')).toBe(false);
  });

  it('limits segment speaker management actions to explicit segment speaker labels', () => {
    const filePath = path.resolve(process.cwd(), 'src/pages/TranscriptionPage.Orchestrator.tsx');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code.includes("const resolveExplicitSpeakerKeyForSegment = useCallback(")).toBe(true);
    expect(code.includes("speakerKey: resolveExplicitSpeakerKeyForSegment(segment),")).toBe(true);
    expect(code.includes(".filter((segment) => resolveExplicitSpeakerKeyForSegment(segment) === speakerKey)")).toBe(true);
  });
});
