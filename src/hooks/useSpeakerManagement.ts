/**
 * useSpeakerManagement | 说话人管理 Hook
 *
 * 收口所有说话人相关的 state、派生数据与操作回调，
 * 包括颜色映射、过滤选项、批量指派、新建、清空、重命名、合并与导出。
 *
 * Consolidates all speaker-related state, derived data, and action callbacks,
 * including color mapping, filter options, batch-assign, create, clear,
 * rename, merge and segment export.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UtteranceDocType, SpeakerDocType } from '../db';
import type { SaveState } from './transcriptionTypes';
import { LinguisticService } from '../services/LinguisticService';
import { fireAndForget } from '../utils/fireAndForget';

// ─── Speaker color helpers ─────────────────────────────────────────────────────

const SPEAKER_TRACK_COLORS = [
  '#2563eb', '#0f766e', '#c2410c', '#7c3aed', '#be123c', '#15803d', '#b45309', '#0891b2',
] as const;

function hashSpeakerKey(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getUtteranceSpeakerKey(
  utterance: Pick<UtteranceDocType, 'speakerId' | 'speaker'>,
): string {
  const speakerId = utterance.speakerId?.trim();
  if (speakerId) return speakerId;
  return `name:${(utterance.speaker?.trim() ?? '')}`;
}

// ─── Hook types ────────────────────────────────────────────────────────────────

export interface SpeakerFilterOption {
  key: string;
  name: string;
  count: number;
  color?: string;
  isEntity: boolean;
}

export interface UseSpeakerManagementOptions {
  // 外部数据 | External data
  utterancesOnCurrentMedia: UtteranceDocType[];
  activeUtteranceUnitId: string | null;
  selectedUtteranceIds: Set<string>;
  /** 已选语段列表（调用方自行派生，避免重复 filter） | Pre-filtered selected utterances */
  selectedBatchUtterances: UtteranceDocType[];
  /** 是否已进入 ready 阶段，用于触发首次加载 | Whether data is ready */
  isReady: boolean;

  // 上层回调 / 操作 | Parent callbacks
  setUtteranceSelection: (primaryId: string, ids: string[]) => void;
  data: {
    pushUndo: (label: string) => void;
    undo: () => Promise<void>;
  };
  loadSnapshot: () => Promise<void>;
  setSaveState: (state: SaveState) => void;
  getUtteranceTextForLayer: (utterance: UtteranceDocType) => string | null | undefined;
  formatTime: (seconds: number) => string;
}

export interface UseSpeakerManagementReturn {
  // 状态 | State
  speakerOptions: SpeakerDocType[];
  speakerDraftName: string;
  setSpeakerDraftName: React.Dispatch<React.SetStateAction<string>>;
  batchSpeakerId: string;
  setBatchSpeakerId: React.Dispatch<React.SetStateAction<string>>;
  speakerSaving: boolean;
  activeSpeakerFilterKey: string;
  setActiveSpeakerFilterKey: React.Dispatch<React.SetStateAction<string>>;

  // 派生数据 | Derived data
  speakerVisualByUtteranceId: Record<string, { name: string; color: string }>;
  speakerFilterOptions: SpeakerFilterOption[];
  selectedSpeakerSummary: string;

  // 操作回调 | Action callbacks
  refreshSpeakers: () => Promise<void>;
  handleSelectSpeakerUtterances: (speakerKey: string) => void;
  handleClearSpeakerAssignments: (speakerKey: string) => void;
  handleExportSpeakerSegments: (speakerKey: string) => void;
  handleRenameSpeaker: (speakerKey: string) => void;
  handleMergeSpeaker: (sourceSpeakerKey: string) => void;
  handleAssignSpeakerToSelected: () => Promise<void>;
  handleCreateSpeakerAndAssign: () => Promise<void>;
}

// ─── Hook implementation ───────────────────────────────────────────────────────

export function useSpeakerManagement({
  utterancesOnCurrentMedia,
  activeUtteranceUnitId,
  selectedUtteranceIds,
  selectedBatchUtterances,
  isReady,
  setUtteranceSelection,
  data,
  loadSnapshot,
  setSaveState,
  getUtteranceTextForLayer,
  formatTime,
}: UseSpeakerManagementOptions): UseSpeakerManagementReturn {
  const [speakerOptions, setSpeakerOptions] = useState<SpeakerDocType[]>([]);
  const [speakerDraftName, setSpeakerDraftName] = useState('');
  const [batchSpeakerId, setBatchSpeakerId] = useState('');
  const [speakerSaving, setSpeakerSaving] = useState(false);
  const [activeSpeakerFilterKey, setActiveSpeakerFilterKey] = useState('all');

  // ─── Derived: speaker visual map ──────────────────────────────────────────
  const speakerVisualByUtteranceId = useMemo(() => {
    const speakerById = new Map(speakerOptions.map((s) => [s.id, s] as const));
    const map: Record<string, { name: string; color: string }> = {};
    for (const utterance of utterancesOnCurrentMedia) {
      const speakerKey = getUtteranceSpeakerKey(utterance);
      const keyBase = speakerKey.startsWith('name:') ? speakerKey.slice(5) : speakerKey;
      if (!keyBase) continue;
      const speakerId = utterance.speakerId?.trim() ?? '';
      const speakerName = speakerId
        ? (speakerById.get(speakerId)?.name ?? utterance.speaker ?? speakerId)
        : (utterance.speaker ?? '未命名说话人');
      const color = SPEAKER_TRACK_COLORS[hashSpeakerKey(keyBase) % SPEAKER_TRACK_COLORS.length]
        ?? SPEAKER_TRACK_COLORS[0];
      map[utterance.id] = { name: speakerName, color };
    }
    return map;
  }, [speakerOptions, utterancesOnCurrentMedia]);

  // ─── Derived: filter options ───────────────────────────────────────────────
  const speakerFilterOptions = useMemo<SpeakerFilterOption[]>(() => {
    const counter = new Map<string, SpeakerFilterOption>();
    for (const utterance of utterancesOnCurrentMedia) {
      const key = getUtteranceSpeakerKey(utterance);
      if (key === 'name:') continue;
      const speakerVisual = speakerVisualByUtteranceId[utterance.id];
      const name = speakerVisual?.name ?? '未标注说话人';
      const existing = counter.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counter.set(key, {
          key,
          name,
          count: 1,
          isEntity: !key.startsWith('name:'),
          ...(speakerVisual?.color ? { color: speakerVisual.color } : {}),
        });
      }
    }
    return Array.from(counter.values()).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'),
    );
  }, [speakerVisualByUtteranceId, utterancesOnCurrentMedia]);

  // ─── Derived: batch selection summary ─────────────────────────────────────
  const selectedSpeakerSummary = useMemo(() => {
    if (selectedBatchUtterances.length === 0) return '未选择句段';
    const assigned = selectedBatchUtterances.filter((utt) => utt.speakerId || utt.speaker);
    if (assigned.length === 0) return '已选句段均未标注说话人';
    const keys = new Set(assigned.map((utt) => utt.speakerId ?? `name:${utt.speaker ?? ''}`));
    if (keys.size === 1) {
      const first = assigned[0];
      const name = first?.speaker
        ?? speakerOptions.find((spk) => spk.id === first?.speakerId)?.name
        ?? '未命名说话人';
      return `当前统一说话人：${name}`;
    }
    return `当前包含 ${keys.size} 位说话人`;
  }, [selectedBatchUtterances, speakerOptions]);

  // ─── Effects ──────────────────────────────────────────────────────────────

  const refreshSpeakers = useCallback(async () => {
    const speakers = await LinguisticService.getSpeakers();
    setSpeakerOptions(speakers);
  }, []);

  // 初次进入 ready 时加载 | Load on first ready
  useEffect(() => {
    if (!isReady) return;
    fireAndForget(refreshSpeakers());
  }, [isReady, refreshSpeakers]);

  // 过滤键失效时回退到 all | Reset filter key when the speaker disappears
  useEffect(() => {
    if (activeSpeakerFilterKey === 'all') return;
    if (speakerFilterOptions.some((opt) => opt.key === activeSpeakerFilterKey)) return;
    setActiveSpeakerFilterKey('all');
  }, [activeSpeakerFilterKey, speakerFilterOptions]);

  // 批量选段变化时同步 batchSpeakerId | Sync batchSpeakerId when selection changes
  useEffect(() => {
    if (selectedBatchUtterances.length === 0) {
      setBatchSpeakerId('');
      return;
    }
    const firstSpeakerId = selectedBatchUtterances[0]?.speakerId;
    if (!firstSpeakerId) {
      setBatchSpeakerId('');
      return;
    }
    const allSame = selectedBatchUtterances.every((utt) => utt.speakerId === firstSpeakerId);
    setBatchSpeakerId(allSame ? firstSpeakerId : '');
  }, [selectedBatchUtterances]);

  // ─── Callbacks ────────────────────────────────────────────────────────────

  const handleSelectSpeakerUtterances = useCallback((speakerKey: string) => {
    const ids = utterancesOnCurrentMedia
      .filter((utterance) => getUtteranceSpeakerKey(utterance) === speakerKey)
      .map((utterance) => utterance.id);
    if (ids.length === 0) {
      setUtteranceSelection('', []);
      return;
    }
    const primary = ids.includes(activeUtteranceUnitId ?? '') ? (activeUtteranceUnitId ?? ids[0]!) : ids[0]!;
    setUtteranceSelection(primary, ids);
    setActiveSpeakerFilterKey(speakerKey);
  }, [activeUtteranceUnitId, setUtteranceSelection, utterancesOnCurrentMedia]);

  const handleClearSpeakerAssignments = useCallback((speakerKey: string) => {
    fireAndForget((async () => {
      try {
        const ids = utterancesOnCurrentMedia
          .filter((utterance) => getUtteranceSpeakerKey(utterance) === speakerKey)
          .map((utterance) => utterance.id);
        if (ids.length === 0) {
          setSaveState({ kind: 'error', message: '未找到可清空的句段' });
          return;
        }
        if (!window.confirm(`确认清空该说话人的标签？将影响 ${ids.length} 条句段。`)) return;
        data.pushUndo('清空说话人标签');
        const cleared = await LinguisticService.assignSpeakerToUtterances(ids, undefined);
        await loadSnapshot();
        setActiveSpeakerFilterKey('all');
        setSaveState({ kind: 'done', message: `已清空 ${cleared} 条句段的说话人标签` });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSaveState({ kind: 'error', message: `清空说话人标签失败：${message}` });
      }
    })());
  }, [data, loadSnapshot, setSaveState, utterancesOnCurrentMedia]);

  const handleExportSpeakerSegments = useCallback((speakerKey: string) => {
    const target = speakerFilterOptions.find((item) => item.key === speakerKey);
    const speakerName = target?.name ?? 'speaker';
    const rows = utterancesOnCurrentMedia
      .filter((utterance) => getUtteranceSpeakerKey(utterance) === speakerKey)
      .sort((a, b) => a.startTime - b.startTime)
      .map((utterance, index) => {
        const text = getUtteranceTextForLayer(utterance) || '';
        return `${index + 1}. [${formatTime(utterance.startTime)} - ${formatTime(utterance.endTime)}] ${text}`;
      });

    if (rows.length === 0) {
      setSaveState({ kind: 'error', message: '该说话人暂无可导出的句段' });
      return;
    }

    if (typeof window === 'undefined') {
      setSaveState({ kind: 'error', message: '当前环境不支持导出' });
      return;
    }

    const content = [`说话人: ${speakerName}`, `句段数量: ${rows.length}`, '', ...rows].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `speaker-${speakerName.replace(/\s+/g, '-')}-${Date.now()}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setSaveState({ kind: 'done', message: `已导出 ${rows.length} 条句段` });
  }, [formatTime, getUtteranceTextForLayer, setSaveState, speakerFilterOptions, utterancesOnCurrentMedia]);

  const handleRenameSpeaker = useCallback((speakerKey: string) => {
    if (speakerKey.startsWith('name:')) {
      setSaveState({ kind: 'error', message: '该说话人尚未实体化，暂不支持重命名' });
      return;
    }
    const current = speakerFilterOptions.find((item) => item.key === speakerKey);
    const nextName = window.prompt('请输入新的说话人名称', current?.name ?? '');
    if (!nextName) return;
    fireAndForget((async () => {
      let undoPushed = false;
      try {
        data.pushUndo('重命名说话人');
        undoPushed = true;
        await LinguisticService.renameSpeaker(speakerKey, nextName);
        await Promise.all([loadSnapshot(), refreshSpeakers()]);
        setSaveState({ kind: 'done', message: `已重命名为"${nextName.trim()}"` });
      } catch (error) {
        if (undoPushed) await data.undo();
        const message = error instanceof Error ? error.message : String(error);
        setSaveState({ kind: 'error', message: `重命名失败：${message}` });
      }
    })());
  }, [data, loadSnapshot, refreshSpeakers, setSaveState, speakerFilterOptions]);

  const handleMergeSpeaker = useCallback((sourceSpeakerKey: string) => {
    if (sourceSpeakerKey.startsWith('name:')) {
      setSaveState({ kind: 'error', message: '该说话人尚未实体化，暂不支持合并' });
      return;
    }
    const candidates = speakerFilterOptions.filter((item) => item.isEntity && item.key !== sourceSpeakerKey);
    if (candidates.length === 0) {
      setSaveState({ kind: 'error', message: '没有可合并的目标说话人' });
      return;
    }
    const hint = candidates.map((item, index) => `${index + 1}. ${item.name}`).join('\n');
    const choice = window.prompt(`输入目标说话人序号：\n${hint}`, '1');
    if (!choice) return;
    const index = Number(choice) - 1;
    const target = candidates[index];
    if (!target) {
      setSaveState({ kind: 'error', message: '无效的目标序号' });
      return;
    }
    const sourceName = speakerFilterOptions.find((item) => item.key === sourceSpeakerKey)?.name ?? '来源说话人';
    if (!window.confirm(`确认将"${sourceName}"合并到"${target.name}"？`)) return;

    fireAndForget((async () => {
      let undoPushed = false;
      try {
        data.pushUndo('合并说话人');
        undoPushed = true;
        const moved = await LinguisticService.mergeSpeakers(sourceSpeakerKey, target.key);
        await Promise.all([loadSnapshot(), refreshSpeakers()]);
        setActiveSpeakerFilterKey(target.key);
        setSaveState({ kind: 'done', message: `已合并，迁移 ${moved} 条句段到"${target.name}"` });
      } catch (error) {
        if (undoPushed) await data.undo();
        const message = error instanceof Error ? error.message : String(error);
        setSaveState({ kind: 'error', message: `合并失败：${message}` });
      }
    })());
  }, [data, loadSnapshot, refreshSpeakers, setSaveState, speakerFilterOptions]);

  const handleAssignSpeakerToSelected = useCallback(async () => {
    if (selectedUtteranceIds.size === 0 || speakerSaving) return;
    setSpeakerSaving(true);
    try {
      data.pushUndo('批量指派说话人');
      const updated = await LinguisticService.assignSpeakerToUtterances(
        selectedUtteranceIds,
        batchSpeakerId || undefined,
      );
      await loadSnapshot();
      setSaveState({
        kind: 'done',
        message: updated > 0 ? `已更新 ${updated} 条句段的说话人` : '未找到可更新句段',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveState({ kind: 'error', message: `说话人指派失败：${message}` });
    } finally {
      setSpeakerSaving(false);
    }
  }, [batchSpeakerId, data, loadSnapshot, selectedUtteranceIds, setSaveState, speakerSaving]);

  const handleCreateSpeakerAndAssign = useCallback(async () => {
    const name = speakerDraftName.trim();
    if (!name || selectedUtteranceIds.size === 0 || speakerSaving) return;
    setSpeakerSaving(true);
    let undoPushed = false;
    try {
      data.pushUndo('新建并分配说话人');
      undoPushed = true;
      const created = await LinguisticService.createSpeaker({ name });
      const updated = await LinguisticService.assignSpeakerToUtterances(selectedUtteranceIds, created.id);
      setSpeakerDraftName('');
      setBatchSpeakerId(created.id);
      await Promise.all([loadSnapshot(), refreshSpeakers()]);
      setSaveState({ kind: 'done', message: `已创建说话人"${created.name}"，并应用到 ${updated} 条句段` });
    } catch (error) {
      if (undoPushed) await data.undo();
      const message = error instanceof Error ? error.message : String(error);
      setSaveState({ kind: 'error', message: `创建说话人失败：${message}` });
    } finally {
      setSpeakerSaving(false);
    }
  }, [data, loadSnapshot, refreshSpeakers, selectedUtteranceIds, setSaveState, speakerDraftName, speakerSaving]);

  return {
    speakerOptions,
    speakerDraftName,
    setSpeakerDraftName,
    batchSpeakerId,
    setBatchSpeakerId,
    speakerSaving,
    activeSpeakerFilterKey,
    setActiveSpeakerFilterKey,
    speakerVisualByUtteranceId,
    speakerFilterOptions,
    selectedSpeakerSummary,
    refreshSpeakers,
    handleSelectSpeakerUtterances,
    handleClearSpeakerAssignments,
    handleExportSpeakerSegments,
    handleRenameSpeaker,
    handleMergeSpeaker,
    handleAssignSpeakerToSelected,
    handleCreateSpeakerAndAssign,
  };
}
