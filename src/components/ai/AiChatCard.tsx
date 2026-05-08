import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import '../../styles/ai-hub.css';
import '../../styles/panels/ai-chat-composer.css';
import '../../styles/panels/ai-chat-thread.css';
import { type AiToolGoldenSnapshot, type AiToolReplayBundle, type AiToolSnapshotDiff } from '../../ai/auditReplay';
import { t, useLocale } from '../../i18n';
import type { AdoptionItem } from '../../ai/vertical/adoptionQueue';
import {
  buildVerticalAdoptionEvidencePacketIds,
  canAcceptAdoptionItem,
  createAdoptionItem,
  pruneExpiredItems,
  transitionAdoptionItem,
  type AdoptionAction,
} from '../../ai/vertical/adoptionQueue';
import { buildAdoptionAcceptProposeChangesUserPrompt } from '../../ai/vertical/adoptionProposeChangesUserPrompt';
import { scheduleAdoptionOutcomeAuditLog } from '../../ai/vertical/adoptionOutcomeAuditPersist';
import type { SavedCorpusSourceSet } from '../../ai/vertical/corpusSourceSet';
import { createSavedSourceSet, switchActiveSourceSet, pruneInvalidatedSourceSets, type SourceSetMemberType } from '../../ai/vertical/corpusSourceSet';
import { getAiChatProviderDefinition } from '../../ai/providers/providerCatalog';
import type { AiChatSettings, AiToolFeedbackStyle } from '../../ai/providers/providerCatalog';
import { useAiAssistantHubContext } from '../../contexts/AiAssistantHubContext';
import { useAiPromptTemplates } from './useAiPromptTemplates';
import { getAiChatCardMessages } from '../../i18n/messages';
import { AiPanelContext } from '../../contexts/AiPanelContext';
import { useGlobalContext } from '../../services/GlobalContextService';
import { getDb } from '../../db';
import { fireAndForget } from '../../utils/fireAndForget';
import { LayerSegmentQueryService } from '../../services/LayerSegmentQueryService';
import { useAssistantDialogueSnapshot } from '../../hooks/useAssistantDialogueSnapshot';
import { isAssistantChatComposerBlocked, isVoiceDialogueBlockingPrimary } from '../../services/assistantDialogueState';
import { deriveAdaptiveProfileFromMessages, mergeAdaptiveProfiles } from '../../ai/chat/adaptiveInputProfile';
import { rankCandidateLabelsByAdaptiveProfile } from './aiChatAdaptiveRanking';
import { useAiChatHybridRecommendations } from './useAiChatHybridRecommendations';
import { buildFollowUpSuggestions } from './aiChatCardFollowUps';
import { useAiChatWebllmWarmup } from './useAiChatWebllmWarmup';
import { useAiChatVerticalWorkflowSummary } from './useAiChatVerticalWorkflowSummary';
import { useAiChatPinnedSummaries } from './useAiChatPinnedSummaries';
import { useAiChatProviderGroups } from './useAiChatProviderGroups';
import { useAiChatPanelResizer } from './useAiChatPanelResizer';
import { useAiChatComposerActions } from './useAiChatComposerActions';
import { useAiChatTransientBlockedHint } from './useAiChatTransientBlockedHint';
import { useAiChatMessageInteractionController } from './useAiChatMessageInteractionController';
import { useAiChatReplayController } from './useAiChatReplayController';
import { AiChatHeaderBar } from './AiChatHeaderBar';
import { AiChatProviderConfigPanel } from './AiChatProviderConfigPanel';
import { useAiChatAutoScrollController } from './useAiChatAutoScrollController';
import { AiChatDecisionPanel } from './AiChatDecisionPanel';
import { AiChatComposerPanel } from './AiChatComposerPanel';
import { AiChatInteractionShell } from './AiChatInteractionShell';
import { AiAdoptionQueuePanel } from './AiAdoptionQueuePanel';
import { useAiChatRecommendationController } from './useAiChatRecommendationController';
import { useAiChatAlertBarState } from './useAiChatAlertBarState';
import { useAiChatComposerGuardState } from './useAiChatComposerGuardState';

type AiChatCardProps = {
  embedded?: boolean;
  showHeader?: boolean;
  showProviderConfigButton?: boolean;
  providerConfigOpen?: boolean;
  onProviderConfigOpenChange?: ((next: boolean) => void) | undefined;
  voiceDrawer?: ReactNode | undefined;
  voiceEntry?: {
    enabled: boolean;
    expanded: boolean;
    listening: boolean;
    statusText?: string;
    onTogglePanel: () => void;
  } | undefined;
};

export function AiChatCard({
  embedded = false,
  showHeader = true,
  showProviderConfigButton = true,
  providerConfigOpen,
  onProviderConfigOpenChange,
  voiceDrawer,
  voiceEntry,
}: AiChatCardProps = {}) {
  const locale = useLocale();
  const {
    currentPage,
    selectedUnit,
    selectedRowMeta,
    selectedUnitKind,
    selectedLayerType,
    selectedText,
    selectedTimeRangeLabel,
    lexemeMatches,
    aiChatEnabled,
    aiChatSettings,
    aiMessages,
    aiIsStreaming,
    aiConversationId,
    aiLastError,
    aiConnectionTestStatus,
    aiConnectionTestMessage,
    aiPendingToolCall,
    aiTaskSession,
    aiInteractionMetrics,
    aiSessionMemory,
    aiToolDecisionLogs,
    aiVerticalWorkflowAuditEntries,
    onUpdateAiChatSettings,
    onTestAiConnection,
    onSendAiMessage,
    onStopAiMessage,
    onClearAiMessages,
    onToggleAiMessagePin,
    onDeactivateAiSessionDirective,
    onPruneAiSessionDirectivesBySourceMessage,
    onConfirmPendingToolCall,
    onCancelPendingToolCall,
    onDismissPendingAgentLoopCheckpoint,
    timelineReadModelEpoch,
    adoptionItemsPushSinkRef,
    onTrackAiRecommendationEvent,
    onSetActiveSourceSetId,
    observerStage,
    onJumpToCitation,
    onVoiceSelectDisambiguation,
    onVoiceDismissDisambiguation,
    onVoiceConfirm,
    onVoiceCancel,
  } = useAiAssistantHubContext();
  const aiPanelContext = useContext(AiPanelContext);
  const { profile } = useGlobalContext();

  const [chatInput, setChatInput] = useState('');
  const [localShowProviderConfig, setLocalShowProviderConfig] = useState(false);
  const [testConnectionPending, setTestConnectionPending] = useState(false);
  const [showPromptLab, setShowPromptLab] = useState(false);
  const [selectedReplayBundle, setSelectedReplayBundle] = useState<AiToolReplayBundle | null>(null);
  const [replayLoadingRequestId, setReplayLoadingRequestId] = useState<string | null>(null);
  const [replayErrorMessage, setReplayErrorMessage] = useState<string | null>(null);
  const [exportedSnapshotRequestId, setExportedSnapshotRequestId] = useState<string | null>(null);
  const [compareSnapshot, setCompareSnapshot] = useState<AiToolGoldenSnapshot | null>(null);
  const [snapshotDiff, setSnapshotDiff] = useState<AiToolSnapshotDiff | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const visibleRecommendationSignatureRef = useRef<string | null>(null);
  const exposedRecommendationRef = useRef<{ prompt: string; source: 'fallback' | 'llm'; signature: string } | null>(null);
  const [dismissedRecommendationSignature, setDismissedRecommendationSignature] = useState<string | null>(null);
  const [directiveSourceFilter, setDirectiveSourceFilter] = useState<'all' | 'user_explicit' | 'background_extracted' | 'pinned_message'>('all');
  const [directiveActionNotice, setDirectiveActionNotice] = useState<string | null>(null);
  const [adoptionItems, setAdoptionItems] = useState<AdoptionItem[]>([]);
  const pendingPostStreamAdoptionPromptsRef = useRef<string[]>([]);
  const [savedSourceSets, setSavedSourceSets] = useState<SavedCorpusSourceSet[]>([]);
  const [activeSourceSetId, setActiveSourceSetId] = useState<string | null>(null);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());

  // P5: Source set hydration from Dexie + invalidation pruning (mount-only by design;
  // continuous invalidation would require subscribing to all related tables)
  useEffect(() => {
    let cancelled = false;
    const promise = getDb()
      .then(async (db) => {
        const rows = await db.collections.ai_source_sets.find().exec();
        if (cancelled) return;
        let sets = rows.map((r) => r.toJSON());

        // P1-3: Runtime invalidation detection
        if (sets.length > 0) {
          const [layerUnitIdsList, texts, lexemes, userNotes, mediaItems, layerLinks] = await Promise.all([
            LayerSegmentQueryService.listAllLayerUnitIds().catch(() => [] as string[]),
            db.collections.texts.find().exec().catch(() => []),
            db.collections.lexemes.find().exec().catch(() => []),
            db.collections.user_notes.find().exec().catch(() => []),
            db.collections.media_items.find().exec().catch(() => []),
            db.collections.layer_links.find().exec().catch(() => []),
          ]);
          const layerUnitIds = new Set(layerUnitIdsList);
          const textIds = new Set(texts.map((t) => t.id));
          const lexemeIds = new Set(lexemes.map((l) => l.id));
          const noteIds = new Set(userNotes.map((n) => n.id));
          const mediaIds = new Set(mediaItems.map((m) => m.id));
          const layerLinkIds = new Set(layerLinks.map((l) => l.id));

          const { updated, invalidatedIds } = pruneInvalidatedSourceSets(
            sets,
            (id, type) => {
              switch (type) {
                case 'segment': return layerUnitIds.has(id);
                case 'document': return textIds.has(id);
                case 'lexeme': return lexemeIds.has(id);
                case 'note': return noteIds.has(id);
                case 'layer': return layerLinkIds.has(id);
                case 'audio_region': return mediaIds.has(id);
                default: return false;
              }
            },
            (mediaId) => mediaIds.has(mediaId),
            (layerId) => layerLinkIds.has(layerId),
          );

          if (invalidatedIds.length > 0) {
            sets = updated;
            await Promise.all(sets.map((set) => db.collections.ai_source_sets.update(set.id, set)));
          }
        }

        if (!cancelled) {
          setSavedSourceSets(sets);
        }
      });
    fireAndForget(promise, { context: 'src/components/ai/AiChatCard.tsx:L208', policy: 'user-visible' });
    return () => { cancelled = true; };
  }, []);

  // P5: Persist source sets to Dexie (serialized via Promise queue to avoid races)
  const persistSourceSets = useCallback((sets: SavedCorpusSourceSet[]) => {
    persistQueueRef.current = persistQueueRef.current.then(async () => {
      const db = await getDb();
      const existing = await db.collections.ai_source_sets.find().exec();
      const existingIds = new Set(existing.map((r) => r.id));
      await Promise.all(sets.map((set) =>
        existingIds.has(set.id)
          ? db.collections.ai_source_sets.update(set.id, set)
          : db.collections.ai_source_sets.insert(set),
      ));
    });
    fireAndForget(persistQueueRef.current, { context: 'src/components/ai/AiChatCard.tsx:L224', policy: 'user-visible' });
  }, []);

  // P5: Source set management
  const handleCreateSourceSet = useCallback(() => {
    const newSet = createSavedSourceSet({
      name: `Source Set ${savedSourceSets.length + 1}`,
      scope: 'selection',
      members: [],
    });
    const nextSets = [...savedSourceSets, newSet];
    setSavedSourceSets(nextSets);
    setActiveSourceSetId(newSet.id);
    onSetActiveSourceSetId?.(newSet.id);
    persistSourceSets(nextSets);
  }, [savedSourceSets, onSetActiveSourceSetId, persistSourceSets]);

  const handleSelectSourceSet = useCallback((id: string) => {
    const nextId = id || null;
    setActiveSourceSetId(nextId);
    onSetActiveSourceSetId?.(nextId);
    if (id) {
      const nextSets = switchActiveSourceSet(savedSourceSets, id);
      setSavedSourceSets(nextSets);
      persistSourceSets(nextSets);
    }
  }, [savedSourceSets, onSetActiveSourceSetId, persistSourceSets]);

  // P5: Source set member management
  const handleAddSourceSetMember = useCallback((setId: string, member: { id: string; type: SourceSetMemberType; label?: string }) => {
    setSavedSourceSets((prev) => {
      const next = prev.map((s) => {
        if (s.id !== setId) return s;
        const newMember = {
          id: member.id,
          type: member.type,
          ...(member.label !== undefined ? { label: member.label } : {}),
        };
        const members = [...s.members, newMember];
        return { ...s, members, updatedAt: new Date().toISOString() };
      });
      persistSourceSets(next);
      return next;
    });
  }, [persistSourceSets]);

  const handleRemoveSourceSetMember = useCallback((setId: string, memberId: string) => {
    setSavedSourceSets((prev) => {
      const next = prev.map((s) => {
        if (s.id !== setId) return s;
        const members = s.members.filter((m) => m.id !== memberId);
        return { ...s, members, updatedAt: new Date().toISOString() };
      });
      persistSourceSets(next);
      return next;
    });
  }, [persistSourceSets]);

  const showProviderConfig = providerConfigOpen ?? localShowProviderConfig;
  const toggleProviderConfig = useCallback(() => {
    const next = !showProviderConfig;
    if (onProviderConfigOpenChange) {
      onProviderConfigOpenChange(next);
      return;
    }
    setLocalShowProviderConfig(next);
  }, [onProviderConfigOpenChange, showProviderConfig]);
  const sessionAdaptiveInputProfile = aiSessionMemory?.preferences?.adaptiveInputProfile ?? aiSessionMemory?.adaptiveInputProfile;
  const sessionLastToolName = aiSessionMemory?.preferences?.lastToolName ?? aiSessionMemory?.lastToolName;

  const activeProviderDefinition = aiChatSettings
    ? getAiChatProviderDefinition(aiChatSettings.providerKind)
    : getAiChatProviderDefinition('mock');

  const isZh = locale === 'zh-CN';
  const cardMessages = useMemo(() => getAiChatCardMessages(isZh), [isZh]);
  const toolFeedbackStyleResolved: AiToolFeedbackStyle = useMemo(
    () => (aiChatSettings?.toolFeedbackStyle === 'concise' ? 'concise' : 'detailed'),
    [aiChatSettings?.toolFeedbackStyle],
  );
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const hasApiKeyField = activeProviderDefinition.fields.some((field) => field.key === 'apiKey');
  const activeDirectiveRows = useMemo(() => (
    (aiSessionMemory?.directiveLedger ?? [])
      .filter((entry) => entry.action === 'accepted')
      .slice(-6)
      .map((entry) => ({
        id: entry.id,
        text: entry.text,
        category: entry.category,
        source: entry.source,
        ...(entry.sourceMessageId !== undefined ? { sourceMessageId: entry.sourceMessageId } : {}),
      }))
  ), [aiSessionMemory?.directiveLedger]);
  const filteredDirectiveRows = useMemo(() => (
    directiveSourceFilter === 'all'
      ? activeDirectiveRows
      : activeDirectiveRows.filter((item) => item.source === directiveSourceFilter)
  ), [activeDirectiveRows, directiveSourceFilter]);

  const promptVars = useMemo<Record<string, string>>(() => {
    const selectedText = selectedUnit?.text?.trim()
      ?? '';
    const currentUnit = selectedUnit
      ? `id=${selectedUnit.id}; text=${selectedText}; time=${selectedUnit.startTime}-${selectedUnit.endTime}`
      : '';
    const lexiconSummary = lexemeMatches.length === 0
      ? ''
      : lexemeMatches
        .slice(0, 5)
        .map((item) => Object.values(item.lemma)[0] ?? item.id)
        .join(', ');

    return {
      selected_text: String(selectedText ?? ''),
      current_unit: currentUnit,
      lexicon_summary: lexiconSummary,
      project_stage: observerStage ?? '',
      current_row: selectedRowMeta ? String(selectedRowMeta.rowNumber) : '',
    };
  }, [lexemeMatches, observerStage, selectedRowMeta, selectedUnit]);

  const adaptiveInputProfile = useMemo(
    () => mergeAdaptiveProfiles(
      deriveAdaptiveProfileFromMessages(aiMessages ?? []),
      sessionAdaptiveInputProfile,
    ),
    [aiMessages, sessionAdaptiveInputProfile],
  );

  const {
    quickPromptTemplates,
    promptTemplates,
    editingTemplateId,
    templateTitleInput,
    templateContentInput,
    setTemplateTitleInput,
    setTemplateContentInput,
    savePromptTemplate,
    editPromptTemplate,
    removePromptTemplate,
    injectPromptTemplate,
    appendPromptVariable,
  } = useAiPromptTemplates({
    promptVars,
    onInjectRenderedPrompt: setChatInput,
    onEditTemplate: () => setShowPromptLab(true),
    ...(adaptiveInputProfile !== undefined ? { adaptiveInputProfile } : {}),
  });

  const providerGroups = useAiChatProviderGroups(cardMessages);

  const providerStatusLabel = useMemo(() => {
    const kind = aiChatSettings?.providerKind ?? 'mock';
    return cardMessages.providerStatusLabel(kind, aiConnectionTestStatus);
  }, [aiChatSettings?.providerKind, aiConnectionTestStatus, cardMessages]);

  const {
    webllmRuntimeStatus,
    webllmWarmupState,
    webllmWarmupMessage,
    webllmFallbackDefinition,
    webllmSourceLabel,
    webllmWarmupPercent,
    webllmWarmupPhaseLabel,
    handleWarmupWebllmModel,
    handleCancelWebllmWarmup,
  } = useAiChatWebllmWarmup({ aiChatSettings, cardMessages, showProviderConfig });

  const showAgentLoopProgress = aiTaskSession?.status === 'executing'
    && typeof aiTaskSession.step === 'number'
    && typeof aiTaskSession.maxSteps === 'number'
    && aiTaskSession.maxSteps > 0;

  const providerStatusTone = useMemo(() => {
    const kind = aiChatSettings?.providerKind ?? 'mock';
    if (aiConnectionTestStatus === 'error') return 'error';
    if (aiConnectionTestStatus === 'success') return 'ok';
    if (kind === 'mock' || kind === 'ollama' || kind === 'webllm') return 'local';
    return 'idle';
  }, [aiChatSettings?.providerKind, aiConnectionTestStatus]);

  const isTestingConnection = testConnectionPending || aiConnectionTestStatus === 'testing';

  const inputPlaceholder = useMemo(() => cardMessages.recommendedInputPlaceholder({
    fallback: t(locale, 'ai.chat.inputPlaceholder'),
    page: currentPage,
    observerStage,
    aiCurrentTask: aiPanelContext?.aiCurrentTask,
    rowNumber: selectedRowMeta?.rowNumber ?? null,
    selectedText: selectedText ?? '',
    annotationStatus: selectedUnit?.annotationStatus ?? null,
    confidence: selectedUnit?.ai_metadata?.confidence ?? null,
    lexemeCount: lexemeMatches.length,
    lastToolName: aiTaskSession?.toolName ?? sessionLastToolName ?? null,
    preferredMode: profile.preferences.preferredMode,
    confirmationThreshold: profile.preferences.confirmationThreshold,
    selectedUnitKind: selectedUnitKind ?? null,
    ...(adaptiveInputProfile?.dominantIntent !== undefined ? { adaptiveIntent: adaptiveInputProfile.dominantIntent } : {}),
    ...(adaptiveInputProfile?.preferredResponseStyle !== undefined ? { adaptiveResponseStyle: adaptiveInputProfile.preferredResponseStyle } : {}),
    ...(adaptiveInputProfile?.topKeywords !== undefined ? { adaptiveKeywords: adaptiveInputProfile.topKeywords } : {}),
    ...(adaptiveInputProfile?.lastPromptExcerpt !== undefined ? { adaptiveLastPromptExcerpt: adaptiveInputProfile.lastPromptExcerpt } : {}),
    ...(selectedLayerType !== undefined ? { selectedLayerType } : {}),
    ...(selectedTimeRangeLabel !== undefined ? { selectedTimeRangeLabel } : {}),
  }), [
    adaptiveInputProfile?.dominantIntent,
    adaptiveInputProfile?.lastPromptExcerpt,
    adaptiveInputProfile?.preferredResponseStyle,
    adaptiveInputProfile?.topKeywords,
    aiPanelContext?.aiCurrentTask,
    aiTaskSession?.toolName,
    sessionLastToolName,
    cardMessages,
    currentPage,
    lexemeMatches.length,
    locale,
    observerStage,
    profile.preferences.confirmationThreshold,
    profile.preferences.preferredMode,
    selectedLayerType,
    selectedRowMeta?.rowNumber,
    selectedText,
    selectedTimeRangeLabel,
    selectedUnitKind,
    selectedUnit,
  ]);

  const rankedClarifyCandidates = useMemo(
    () => rankCandidateLabelsByAdaptiveProfile(aiTaskSession?.candidates ?? [], adaptiveInputProfile),
    [adaptiveInputProfile, aiTaskSession?.candidates],
  );

  const latestAssistantMessage = useMemo(() => {
    const sourceMessages = aiMessages ?? [];
    for (let index = sourceMessages.length - 1; index >= 0; index -= 1) {
      const item = sourceMessages[index];
      if (item?.role === 'assistant') return item;
    }
    return null;
  }, [aiMessages]);

  const followUpSuggestions = useMemo(() => buildFollowUpSuggestions({
    isZh,
    latestAssistantMessage,
    lastFrame: aiSessionMemory?.localToolState?.lastFrame,
  }), [aiSessionMemory?.localToolState?.lastFrame, isZh, latestAssistantMessage]);

  const recentTaskTrace = useMemo(
    () => [...(aiTaskSession?.trace ?? [])].slice(-3).reverse(),
    [aiTaskSession?.trace],
  );

  const hybridRecommendations = useAiChatHybridRecommendations({
    locale,
    enabled: aiChatEnabled,
    composerIdle: chatInput.trim().length === 0 && !aiIsStreaming,
    aiChatSettings,
    connectionTestStatus: aiConnectionTestStatus,
    recommendationTelemetry: aiSessionMemory?.recommendationTelemetry,
    primarySuggestion: inputPlaceholder,
    page: currentPage,
    observerStage,
    aiCurrentTask: aiPanelContext?.aiCurrentTask,
    rowNumber: selectedRowMeta?.rowNumber ?? null,
    selectedText: selectedText ?? '',
    annotationStatus: selectedUnit?.annotationStatus ?? null,
    confidence: selectedUnit?.ai_metadata?.confidence ?? null,
    lexemeCount: lexemeMatches.length,
    lastToolName: aiTaskSession?.toolName ?? sessionLastToolName ?? null,
    preferredMode: profile.preferences.preferredMode,
    confirmationThreshold: profile.preferences.confirmationThreshold,
    selectedUnitKind: selectedUnitKind ?? null,
    selectedLayerType: selectedLayerType ?? null,
    selectedTimeRangeLabel: selectedTimeRangeLabel ?? null,
    ...(adaptiveInputProfile?.dominantIntent !== undefined ? { adaptiveIntent: adaptiveInputProfile.dominantIntent } : {}),
    ...(adaptiveInputProfile?.preferredResponseStyle !== undefined ? { adaptiveResponseStyle: adaptiveInputProfile.preferredResponseStyle } : {}),
    ...(adaptiveInputProfile?.topKeywords !== undefined ? { adaptiveKeywords: adaptiveInputProfile.topKeywords } : {}),
    ...(adaptiveInputProfile?.lastPromptExcerpt !== undefined ? { adaptiveLastPromptExcerpt: adaptiveInputProfile.lastPromptExcerpt } : {}),
  });
  const topHybridRecommendation = hybridRecommendations.items[0];
  const hybridInputSuggestion = topHybridRecommendation?.prompt ?? inputPlaceholder;
  const hybridInputSignature = topHybridRecommendation
    ? `${hybridRecommendations.source}:${topHybridRecommendation.prompt}`
    : `fallback:${inputPlaceholder}`;
  const showInlineRecommendation = chatInput.length === 0
    && !aiIsStreaming
    && hybridInputSuggestion.trim().length > 0
    && dismissedRecommendationSignature !== hybridInputSignature;
  const composerPlaceholder = showInlineRecommendation ? '' : inputPlaceholder;

  useAiChatRecommendationController({
    dismissedRecommendationSignature,
    hybridInputSignature,
    setDismissedRecommendationSignature,
    topRecommendation: topHybridRecommendation,
    showInlineRecommendation,
    recommendationSource: hybridRecommendations.source,
    visibleRecommendationSignatureRef,
    exposedRecommendationRef,
    onTrackAiRecommendationEvent,
  });

  const chatTitle = useMemo(() => t(locale, 'ai.chat.title').replace(/\s*[（(]MVP[）)]\s*/gi, ''), [locale]);
  const messages = aiMessages ?? [];

  // PR-P4-3: Derive adoption items from vertical workflow audit entries（证据占位与助手 citations / envelope 对齐）
  useEffect(() => {
    const list = aiMessages ?? [];
    if (aiVerticalWorkflowAuditEntries.length === 0) return;
    const latestEntry = aiVerticalWorkflowAuditEntries[aiVerticalWorkflowAuditEntries.length - 1];
    if (!latestEntry) return;
    const workflowId = latestEntry.metadata.workflowId;
    if (!workflowId || latestEntry.metadata.completionStatus !== 'done') return;
    const assistantMessageId = latestEntry.assistantMessageId;
    const assistantMsg = list.find((m) => m.id === assistantMessageId && m.role === 'assistant');
    const evidencePacketIds = buildVerticalAdoptionEvidencePacketIds({
      assistantMessageId,
      metadata: latestEntry.metadata,
      citations: assistantMsg?.citations,
    });
    const requestKey = latestEntry.requestId ?? latestEntry.assistantMessageId;
    setAdoptionItems((prev) => {
      const pendingIdx = prev.findIndex(
        (item) => item.requestId === requestKey && item.status === 'pending',
      );
      if (pendingIdx >= 0) {
        const cur = prev[pendingIdx]!;
        if (
          evidencePacketIds.length > cur.evidencePacketIds.length
          || (assistantMsg?.content !== undefined && assistantMsg.content !== cur.rawContent)
        ) {
          const next = [...prev];
          next[pendingIdx] = {
            ...cur,
            evidencePacketIds: evidencePacketIds.length > 0 ? evidencePacketIds : cur.evidencePacketIds,
            ...(assistantMsg?.content !== undefined ? { rawContent: assistantMsg.content } : {}),
          };
          return next;
        }
        return prev;
      }
      const alreadyExists = prev.some((item) => item.requestId === requestKey);
      if (alreadyExists) return prev;
      const newItem = createAdoptionItem({
        workflowId,
        requestId: requestKey,
        summary: `${workflowId} output`,
        evidencePacketIds,
        sourceAssistantMessageId: assistantMessageId,
        ...(assistantMsg?.content !== undefined ? { rawContent: assistantMsg.content } : {}),
      });
      return [...prev, newItem];
    });
  }, [aiVerticalWorkflowAuditEntries, aiMessages]);

  useEffect(() => {
    const sink = adoptionItemsPushSinkRef;
    if (!sink) return;
    sink.current = (incoming) => {
      setAdoptionItems((prev) => {
        const seen = new Set(prev.map((i) => i.requestId));
        const next = [...prev];
        for (const item of incoming) {
          if (seen.has(item.requestId)) continue;
          seen.add(item.requestId);
          next.push(item);
        }
        return next;
      });
    };
    return () => {
      sink.current = null;
    };
  }, [adoptionItemsPushSinkRef]);

  // P4: auto-prune expired adoption items on mount and when items change
  useEffect(() => {
    setAdoptionItems((prev) => {
      if (prev.length === 0) return prev;
      const pruned = pruneExpiredItems({ items: prev }, Date.now(), undefined, (expiredItems) => {
        for (const item of expiredItems) {
          scheduleAdoptionOutcomeAuditLog({ conversationId: aiConversationId, item, action: 'expire' });
        }
      });
      return pruned.items;
    });
  }, [aiConversationId]);

  // P4: rehydrate adoption items from persisted compatibility reports on mount
  useEffect(() => {
    const messages = aiMessages ?? [];
    if (messages.length === 0) return;
    setAdoptionItems((prev) => {
      const seen = new Set(prev.map((i) => i.requestId));
      const next = [...prev];
      for (const msg of messages) {
        if (msg.role !== 'assistant' || !msg.compatibilityReport) continue;
        const report = msg.compatibilityReport;
        for (const finding of report.findings) {
          const requestId = `${report.reportId}:${finding.findingId}`;
          if (seen.has(requestId)) continue;
          seen.add(requestId);
          next.push(
            createAdoptionItem({
              workflowId: 'elan_flex_compatibility',
              requestId,
              sourceAssistantMessageId: msg.id,
              summary: finding.title,
              evidencePacketIds: [],
              rawContent: finding.description,
              actionLabel: finding.recommendedAction,
            }),
          );
        }
      }
      return next;
    });
  }, [aiMessages]);

  useEffect(() => {
    if (aiIsStreaming) return;
    const pending = pendingPostStreamAdoptionPromptsRef.current;
    if (pending.length === 0) return;
    pendingPostStreamAdoptionPromptsRef.current = [];
    for (const prompt of pending) {
      void onSendAiMessage?.(prompt);
    }
  }, [aiIsStreaming, onSendAiMessage]);

  /** 流式阶段正文+推理长度；用于贴底滚动依赖，避免仅 messages.length 变化时才滚动 | Scroll anchor during token stream */
  const streamingThreadScrollSignature = useMemo(() => {
    if (!aiIsStreaming) return 0;
    let sum = 0;
    for (const m of messages) {
      if (m.role !== 'assistant' || m.status !== 'streaming') continue;
      sum += (m.content?.length ?? 0) + (m.reasoningContent?.length ?? 0);
    }
    return sum;
  }, [aiIsStreaming, messages]);
  const {
    expandedReasoningIds,
    copiedMessageId,
    optimisticUnpinnedMessageIds,
    optimisticPinnedMessageIds,
    clearOptimisticPins,
    toggleMessagePin,
    copyAssistantMessage,
    toggleReasoning,
    activateCitation,
  } = useAiChatMessageInteractionController({
    onToggleAiMessagePin,
    onJumpToCitation,
  });

  const handleAdoptionQueueItemAction = useCallback((itemId: string, action: AdoptionAction, options?: { reasonCode?: string }) => {
    if (action === 'accept') {
      const item = adoptionItems.find((i) => i.id === itemId);
      if (!item || !canAcceptAdoptionItem(item)) return;
      const applyAccept = () => {
        setAdoptionItems((prev) => {
          const row = prev.find((i) => i.id === itemId);
          if (!row) return prev;
          scheduleAdoptionOutcomeAuditLog({ conversationId: aiConversationId, item: row, action: 'accept' });
          try {
            return prev.map((r) => (r.id === itemId ? transitionAdoptionItem(r, 'accept', options) : r));
          } catch {
            return prev;
          }
        });
      };
      if (onSendAiMessage && aiIsStreaming) {
        const head = t(locale, 'msg.aiChat.adoptionQueue.proposeChangesHead');
        const prompt = buildAdoptionAcceptProposeChangesUserPrompt(item, head);
        pendingPostStreamAdoptionPromptsRef.current.push(prompt);
        flushSync(applyAccept);
        return;
      }
      if (onSendAiMessage && !aiIsStreaming) {
        const head = t(locale, 'msg.aiChat.adoptionQueue.proposeChangesHead');
        const prompt = buildAdoptionAcceptProposeChangesUserPrompt(item, head);
        flushSync(applyAccept);
        void onSendAiMessage(prompt);
      } else {
        applyAccept();
      }
      return;
    }

    setAdoptionItems((prev) => {
      const item = prev.find((i) => i.id === itemId);
      if (!item) return prev;
      if (action !== 'jump_to_evidence') {
        scheduleAdoptionOutcomeAuditLog({ conversationId: aiConversationId, item, action });
      }
      try {
        return prev.map((row) => {
          if (row.id !== itemId) return row;
          return transitionAdoptionItem(row, action, options);
        });
      } catch {
        return prev;
      }
    });
  }, [adoptionItems, aiConversationId, aiIsStreaming, locale, onSendAiMessage]);

  const handleJumpAdoptionEvidence = useCallback((packetIds: string[]) => {
    const first = packetIds[0];
    if (!first) return;
    const matched = /^vertical_evidence:([^:]+):(\d+)$/.exec(first);
    if (!matched) return;
    const messageId = matched[1];
    const index = Number.parseInt(matched[2] ?? '0', 10);
    const msg = messages.find((x) => x.id === messageId && x.role === 'assistant');
    const citations = msg?.citations ?? [];
    const citation = citations[index] ?? citations[0];
    if (!citation) return;
    activateCitation(
      { type: citation.type, refId: citation.refId },
      citation.snippet !== undefined ? { snippet: citation.snippet } : undefined,
    );
  }, [messages, activateCitation]);

  const {
    pinnedMessageIdsSignature,
    pinnedMessageIdSet,
    pinnedSummaryItems,
    hasConversationSummary,
    summaryEntries,
  } = useAiChatPinnedSummaries({
    aiSessionMemory,
    messages,
    optimisticPinnedMessageIds,
    optimisticUnpinnedMessageIds,
    isZh,
  });
  const summaryQualityWarning = aiSessionMemory?.summaryQualityWarning ?? null;
  const turns = useMemo(() => {
    const newestTurns: Array<{ assistant?: typeof messages[number]; user?: typeof messages[number] }> = [];
    let index = 0;
    while (index < messages.length) {
      const current = messages[index];
      const next = messages[index + 1];
      if (!current) break;

      if (next && current.role !== next.role) {
        newestTurns.push({
          user: current.role === 'user' ? current : next,
          assistant: current.role === 'assistant' ? current : next,
        });
        index += 2;
        continue;
      }

      newestTurns.push(current.role === 'assistant' ? { assistant: current } : { user: current });
      index += 1;
    }

    return [...newestTurns].reverse();
  }, [messages]);

  useAiChatAutoScrollController({
    messageViewportRef,
    aiIsStreaming,
    messagesLength: messages.length,
    streamingThreadScrollSignature,
  });

  // P0: count active alerts for the alert bar
  const assistantDialogue = useAssistantDialogueSnapshot();
  const hasVoiceDialogueBlocking = isVoiceDialogueBlockingPrimary(assistantDialogue.primary);
  const sharedDialogueComposerBlocked = isAssistantChatComposerBlocked({
    hasToolPending: !!aiPendingToolCall,
    dialoguePrimary: assistantDialogue.primary,
  });
  const hasToolPending = !!aiPendingToolCall;
  const hasAgentLoopHandoffPending = Boolean(aiSessionMemory?.pendingAgentLoopCheckpoint);
  const hasDecisionLogs = (aiToolDecisionLogs ?? []).length > 0;
  const alertCount = (hasToolPending || hasAgentLoopHandoffPending || hasVoiceDialogueBlocking) ? 1 : 0;
  const { errorWarningText, persistLayerRecoveryActions, inputBlockedReason } = useAiChatComposerGuardState({
    aiLastError,
    cardMessages,
    aiMessages,
    aiIsStreaming,
    onSendAiMessage,
    activeProviderLabel: activeProviderDefinition.label,
    aiConversationId,
    hasToolPending,
    hasVoiceDialogueBlocking,
  });
  const { showAlertBar, setShowAlertBar } = useAiChatAlertBarState(alertCount);
  const [showDecisionPanel, setShowDecisionPanel] = useState(false);
  const [showReplayDetailPanel, setShowReplayDetailPanel] = useState(false);
  const [showConversationSummary, setShowConversationSummary] = useState(false);
  const [showVerticalWorkflowDetail, setShowVerticalWorkflowDetail] = useState(false);
  const [dismissedErrorWarning, setDismissedErrorWarning] = useState(false);
  const {
    latestVerticalWorkflowEntry,
    latestVerticalWorkflowSummary,
    latestVerticalWorkflowRequestId,
    latestVerticalWorkflowSelectionSummary,
    latestVerticalWorkflowSelectionKeywordSummary,
    latestVerticalWorkflowSelectionConfidenceSummary,
  } = useAiChatVerticalWorkflowSummary({
    latestAssistantMessage,
    aiVerticalWorkflowAuditEntries,
    cardMessages,
  });
  const isLatestVerticalReplayLoading = latestVerticalWorkflowRequestId !== null
    && replayLoadingRequestId === latestVerticalWorkflowRequestId;
  const isLatestVerticalReplaySelected = latestVerticalWorkflowRequestId !== null
    && selectedReplayBundle?.requestId === latestVerticalWorkflowRequestId;
  const [copiedVerticalWorkflowRequestId, setCopiedVerticalWorkflowRequestId] = useState<string | null>(null);
  const [decisionReplayFocusRequestId, setDecisionReplayFocusRequestId] = useState<string | null>(null);
  const [decisionReplayLocatedRequestId, setDecisionReplayLocatedRequestId] = useState<string | null>(null);
  const copiedVerticalRequestTimerRef = useRef<number | null>(null);
  const exportedSnapshotTimerRef = useRef<number | null>(null);
  const decisionPanelBodyRef = useRef<HTMLDivElement | null>(null);
  const decisionPanelToggleButtonRef = useRef<HTMLButtonElement | null>(null);
  const decisionItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { transientBlockedReason, showTransientBlockedReason } = useAiChatTransientBlockedHint(aiIsStreaming);
  const canUseVoiceEntry = Boolean(voiceEntry?.enabled);
  const {
    isVoiceDrawerResizing,
    isDecisionPanelResizing,
    voiceDrawerInlineStyle,
    decisionPanelInlineStyle,
    startVoiceDrawerResize,
    startDecisionPanelResize,
  } = useAiChatPanelResizer({
    voiceDrawerExpanded: Boolean(voiceEntry?.expanded),
    showDecisionPanel,
    decisionPanelBodyRef,
  });

  useEffect(() => {
    if (!hasConversationSummary && showConversationSummary) {
      setShowConversationSummary(false);
    }
  }, [hasConversationSummary, showConversationSummary]);

  useEffect(() => {
    if (!latestVerticalWorkflowEntry && showVerticalWorkflowDetail) {
      setShowVerticalWorkflowDetail(false);
    }
  }, [latestVerticalWorkflowEntry, showVerticalWorkflowDetail]);

  useEffect(() => {
    setCopiedVerticalWorkflowRequestId(null);
  }, [latestVerticalWorkflowRequestId]);

  useEffect(() => {
    clearOptimisticPins();
  }, [clearOptimisticPins, pinnedMessageIdsSignature]);

  useEffect(() => {
    setDismissedErrorWarning(false);
  }, [errorWarningText]);

  useEffect(() => {
    setShowReplayDetailPanel(false);
  }, [selectedReplayBundle?.requestId]);

  useEffect(() => {
    if (!showDecisionPanel || !decisionReplayFocusRequestId || typeof window === 'undefined') return;
    const target = decisionItemRefs.current[decisionReplayFocusRequestId];
    if (!target) return;
    window.requestAnimationFrame(() => {
      if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
      }
    });
  }, [showDecisionPanel, decisionReplayFocusRequestId, aiToolDecisionLogs]);

  useEffect(() => {
    return () => {
      if (copiedVerticalRequestTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(copiedVerticalRequestTimerRef.current);
      }
      if (exportedSnapshotTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(exportedSnapshotTimerRef.current);
      }
    };
  }, []);

  const {
    openReplayBundle,
    openLatestVerticalWorkflowReplay,
    copyLatestVerticalWorkflowRequestId,
    exportGoldenSnapshot,
    importSnapshotForCompare,
  } = useAiChatReplayController({
    compareSnapshot,
    isZh,
    setDecisionReplayFocusRequestId,
    setDecisionReplayLocatedRequestId,
    setReplayLoadingRequestId,
    setReplayErrorMessage,
    setSelectedReplayBundle,
    setSnapshotDiff,
    latestVerticalWorkflowRequestId,
    setShowDecisionPanel,
    copiedVerticalRequestTimerRef,
    setCopiedVerticalWorkflowRequestId,
    cardMessages,
    selectedReplayBundle,
    setExportedSnapshotRequestId,
    exportedSnapshotTimerRef,
    setCompareSnapshot,
  });

  const { submitChatInput, submitFollowUpPrompt, handleComposerKeyDown } = useAiChatComposerActions({
    chatInput, setChatInput, chatInputRef, onSendAiMessage, aiIsStreaming, sharedDialogueComposerBlocked,
    inputBlockedReason, cardMessages, showTransientBlockedReason, setShowAlertBar,
    exposedRecommendationRef, onTrackAiRecommendationEvent, setDismissedRecommendationSignature, topHybridRecommendation,
    showInlineRecommendation, hybridInputSignature,
  });

  const updateCostGuardSetting = useCallback((
    key: 'sessionTokenBudget' | 'outputTokenCap' | 'outputTokenRetryCap',
    rawValue: string,
  ) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    onUpdateAiChatSettings?.({ [key]: Math.floor(parsed) } as Partial<AiChatSettings>);
  }, [onUpdateAiChatSettings]);

  return (
    <div className={`transcription-ai-card ${embedded ? 'transcription-ai-card-embedded' : ''}`}>
      {showHeader && (
        <>
          <AiChatHeaderBar
            chatTitle={chatTitle}
            toolFeedbackStyleResolved={toolFeedbackStyleResolved}
            cardMessages={cardMessages}
            onUpdateAiChatSettings={onUpdateAiChatSettings}
            providerStatusTone={providerStatusTone}
            providerStatusLabel={providerStatusLabel}
            activeProviderLabel={activeProviderDefinition.label}
            aiChatSettings={aiChatSettings}
            providerGroups={providerGroups}
            showProviderConfigButton={showProviderConfigButton}
            showProviderConfig={showProviderConfig}
            onToggleProviderConfig={toggleProviderConfig}
          />
        </>
      )}

      {/* P0: Provider config panel (collapsible below header) */}
      {aiChatSettings && showProviderConfig && (
        <AiChatProviderConfigPanel
          aiChatSettings={aiChatSettings}
          activeProviderFields={activeProviderDefinition.fields}
          onUpdateAiChatSettings={onUpdateAiChatSettings}
          updateCostGuardSetting={updateCostGuardSetting}
          cardMessages={cardMessages}
          locale={locale}
          onTestAiConnection={onTestAiConnection}
          isTestingConnection={isTestingConnection}
          setTestConnectionPending={setTestConnectionPending}
          aiConnectionTestStatus={aiConnectionTestStatus}
          aiConnectionTestMessage={aiConnectionTestMessage}
          hasApiKeyField={hasApiKeyField}
          webllmWarmupState={webllmWarmupState}
          handleWarmupWebllmModel={handleWarmupWebllmModel}
          handleCancelWebllmWarmup={handleCancelWebllmWarmup}
          webllmRuntimeStatus={webllmRuntimeStatus}
          webllmSourceLabel={webllmSourceLabel}
          webllmFallbackLabel={webllmFallbackDefinition.label}
          webllmWarmupPercent={webllmWarmupPercent}
          webllmWarmupPhaseLabel={webllmWarmupPhaseLabel}
          webllmWarmupMessage={webllmWarmupMessage}
        />
      )}

      {!aiChatEnabled ? (
        <p className="small-text">{t(locale, 'ai.chat.disabled')}</p>
      ) : (
        <>
          <AiChatInteractionShell
            locale={locale}
            cardMessages={cardMessages}
            hasConversationSummary={hasConversationSummary}
            showConversationSummary={showConversationSummary}
            setShowConversationSummary={setShowConversationSummary}
            summaryQualityWarning={summaryQualityWarning}
            summaryEntries={summaryEntries}
            latestVerticalWorkflowSummary={latestVerticalWorkflowSummary}
            latestVerticalWorkflowEntry={latestVerticalWorkflowEntry}
            latestVerticalWorkflowSelectionSummary={latestVerticalWorkflowSelectionSummary}
            latestVerticalWorkflowSelectionKeywordSummary={latestVerticalWorkflowSelectionKeywordSummary}
            latestVerticalWorkflowSelectionConfidenceSummary={latestVerticalWorkflowSelectionConfidenceSummary}
            latestVerticalWorkflowRequestId={latestVerticalWorkflowRequestId}
            showVerticalWorkflowDetail={showVerticalWorkflowDetail}
            setShowVerticalWorkflowDetail={setShowVerticalWorkflowDetail}
            isLatestVerticalReplayLoading={isLatestVerticalReplayLoading}
            isLatestVerticalReplaySelected={isLatestVerticalReplaySelected}
            copiedVerticalWorkflowRequestId={copiedVerticalWorkflowRequestId}
            openLatestVerticalWorkflowReplay={openLatestVerticalWorkflowReplay}
            copyLatestVerticalWorkflowRequestId={copyLatestVerticalWorkflowRequestId}
            messageViewportRef={messageViewportRef}
            messages={messages}
            turns={turns}
            pinnedMessageIdSet={pinnedMessageIdSet}
            pinnedSummaryItems={pinnedSummaryItems}
            expandedReasoningIds={expandedReasoningIds}
            copiedMessageId={copiedMessageId}
            canToggleMessagePin={Boolean(onToggleAiMessagePin)}
            canActivateCitation={Boolean(onJumpToCitation)}
            toggleMessagePin={toggleMessagePin}
            copyAssistantMessage={copyAssistantMessage}
            toggleReasoning={toggleReasoning}
            activateCitation={activateCitation}
            onClearAiMessages={onClearAiMessages}
            isZh={isZh}
            aiIsStreaming={aiIsStreaming}
            errorWarningText={errorWarningText}
            dismissedErrorWarning={dismissedErrorWarning}
            alertCount={alertCount}
            showAlertBar={showAlertBar}
            assistantDialogue={assistantDialogue}
            onVoiceSelectDisambiguation={onVoiceSelectDisambiguation}
            onVoiceDismissDisambiguation={onVoiceDismissDisambiguation}
            onVoiceConfirm={onVoiceConfirm}
            onVoiceCancel={onVoiceCancel}
            aiPendingToolCall={aiPendingToolCall}
            aiSessionMemory={aiSessionMemory}
            aiToolDecisionLogs={aiToolDecisionLogs}
            timelineReadModelEpoch={timelineReadModelEpoch}
            setDismissedErrorWarning={setDismissedErrorWarning}
            setShowAlertBar={setShowAlertBar}
            openReplayBundle={openReplayBundle}
            onSendAiMessage={onSendAiMessage}
            onDismissPendingAgentLoopCheckpoint={onDismissPendingAgentLoopCheckpoint}
            onConfirmPendingToolCall={onConfirmPendingToolCall}
            onCancelPendingToolCall={onCancelPendingToolCall}
            persistLayerRecoveryActions={persistLayerRecoveryActions}
            aiTaskSession={aiTaskSession}
            rankedClarifyCandidates={rankedClarifyCandidates}
            savedSourceSets={savedSourceSets}
            activeSourceSetId={activeSourceSetId}
            onSelectSourceSet={handleSelectSourceSet}
            onCreateSourceSet={handleCreateSourceSet}
            onAddSourceSetMember={handleAddSourceSetMember}
            onRemoveSourceSetMember={handleRemoveSourceSetMember}
          />

          <AiAdoptionQueuePanel
            items={adoptionItems}
            locale={locale}
            onItemAction={handleAdoptionQueueItemAction}
            {...(onJumpToCitation ? { onJumpToEvidence: handleJumpAdoptionEvidence } : {})}
          />

          <AiChatComposerPanel
            showAgentLoopProgress={showAgentLoopProgress}
            cardMessages={cardMessages}
            aiTaskSession={aiTaskSession}
            recentTaskTrace={recentTaskTrace}
            isZh={isZh}
            followUpSuggestions={followUpSuggestions}
            submitFollowUpPrompt={submitFollowUpPrompt}
            aiInteractionMetrics={aiInteractionMetrics}
            aiSessionMemory={aiSessionMemory}
            quickPromptTemplates={quickPromptTemplates}
            injectPromptTemplate={injectPromptTemplate}
            chatInputRef={chatInputRef}
            showInlineRecommendation={showInlineRecommendation}
            chatInput={chatInput}
            composerPlaceholder={composerPlaceholder}
            hybridInputSuggestion={hybridInputSuggestion}
            inputPlaceholder={inputPlaceholder}
            setChatInput={setChatInput}
            handleComposerKeyDown={handleComposerKeyDown}
            aiIsStreaming={aiIsStreaming}
            onStopAiMessage={onStopAiMessage}
            onSendAiMessage={onSendAiMessage}
            sharedDialogueComposerBlocked={sharedDialogueComposerBlocked}
            submitChatInput={submitChatInput}
            canUseVoiceEntry={canUseVoiceEntry}
            voiceEntry={voiceEntry}
            activeDirectiveRows={activeDirectiveRows}
            filteredDirectiveRows={filteredDirectiveRows}
            directiveSourceFilter={directiveSourceFilter}
            directiveActionNotice={directiveActionNotice}
            setDirectiveSourceFilter={setDirectiveSourceFilter}
            setDirectiveActionNotice={setDirectiveActionNotice}
            onDeactivateAiSessionDirective={onDeactivateAiSessionDirective}
            onPruneAiSessionDirectivesBySourceMessage={onPruneAiSessionDirectivesBySourceMessage}
            transientBlockedReason={transientBlockedReason}
            inputBlockedReason={inputBlockedReason}
            showPromptLab={showPromptLab}
            setShowPromptLab={setShowPromptLab}
            promptTemplates={promptTemplates}
            editingTemplateId={editingTemplateId}
            templateTitleInput={templateTitleInput}
            templateContentInput={templateContentInput}
            editPromptTemplate={editPromptTemplate}
            removePromptTemplate={removePromptTemplate}
            setTemplateTitleInput={setTemplateTitleInput}
            setTemplateContentInput={setTemplateContentInput}
            appendPromptVariable={appendPromptVariable}
            savePromptTemplate={savePromptTemplate}
            isVoiceDrawerResizing={isVoiceDrawerResizing}
            voiceDrawerInlineStyle={voiceDrawerInlineStyle}
            startVoiceDrawerResize={startVoiceDrawerResize}
            voiceDrawer={voiceDrawer}
            locale={locale}
          />

          <div className="ai-chat-composer">
            <AiChatDecisionPanel
              cardMessages={cardMessages}
              showDecisionPanel={showDecisionPanel}
              hasDecisionLogs={hasDecisionLogs}
              isDecisionPanelResizing={isDecisionPanelResizing}
              decisionPanelInlineStyle={decisionPanelInlineStyle}
              decisionPanelToggleButtonRef={decisionPanelToggleButtonRef}
              decisionPanelBodyRef={decisionPanelBodyRef}
              startDecisionPanelResize={startDecisionPanelResize}
              aiToolDecisionLogs={aiToolDecisionLogs}
              replayLoadingRequestId={replayLoadingRequestId}
              selectedReplayBundle={selectedReplayBundle}
              decisionReplayFocusRequestId={decisionReplayFocusRequestId}
              decisionReplayLocatedRequestId={decisionReplayLocatedRequestId}
              decisionItemRefs={decisionItemRefs}
              openReplayBundle={openReplayBundle}
              exportGoldenSnapshot={exportGoldenSnapshot}
              replayErrorMessage={replayErrorMessage}
              isZh={isZh}
              showReplayDetailPanel={showReplayDetailPanel}
              compareSnapshot={compareSnapshot}
              snapshotDiff={snapshotDiff}
              importFileInputRef={importFileInputRef}
              setShowReplayDetailPanel={setShowReplayDetailPanel}
              setSelectedReplayBundle={setSelectedReplayBundle}
              setCompareSnapshot={setCompareSnapshot}
              setSnapshotDiff={setSnapshotDiff}
              importSnapshotForCompare={importSnapshotForCompare}
              exportedSnapshotRequestId={exportedSnapshotRequestId}
              onTogglePanel={() => setShowDecisionPanel((prev) => !prev)}
            />
          </div>

        </>
      )}
    </div>
  );
}
