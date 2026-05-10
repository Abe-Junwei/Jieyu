import { memo } from 'react';
import type { AnalysisBottomTab } from './AiAnalysisPanel.types';
import type { AiAnalysisPanelAcousticTabModel } from './useAiAnalysisPanelAcousticModel';
import { AiAnalysisPanelAcousticDescriptorSection } from './aiAnalysisPanelAcoustic/AiAnalysisPanelAcousticDescriptorSection';
import { AiAnalysisPanelAcousticDiagnosticsSection } from './aiAnalysisPanelAcoustic/AiAnalysisPanelAcousticDiagnosticsSection';
import { AiAnalysisPanelAcousticExportSection } from './aiAnalysisPanelAcoustic/AiAnalysisPanelAcousticExportSection';
import { AiAnalysisPanelAcousticFormantSection } from './aiAnalysisPanelAcoustic/AiAnalysisPanelAcousticFormantSection';
import { AiAnalysisPanelAcousticHotspotsSection } from './aiAnalysisPanelAcoustic/AiAnalysisPanelAcousticHotspotsSection';
import { AiAnalysisPanelAcousticInspectorSection } from './aiAnalysisPanelAcoustic/AiAnalysisPanelAcousticInspectorSection';
import { AiAnalysisPanelAcousticNavigationSection } from './aiAnalysisPanelAcoustic/AiAnalysisPanelAcousticNavigationSection';
import { AiAnalysisPanelAcousticOverviewSection } from './aiAnalysisPanelAcoustic/AiAnalysisPanelAcousticOverviewSection';
import { AiAnalysisPanelAcousticProviderSection } from './aiAnalysisPanelAcoustic/AiAnalysisPanelAcousticProviderSection';
import { AiAnalysisPanelAcousticRuntimeSection } from './aiAnalysisPanelAcoustic/AiAnalysisPanelAcousticRuntimeSection';
import { AiAnalysisPanelAcousticSliceSection } from './aiAnalysisPanelAcoustic/AiAnalysisPanelAcousticSliceSection';
import { AiAnalysisPanelAcousticToneSection } from './aiAnalysisPanelAcoustic/AiAnalysisPanelAcousticToneSection';

export const AiAnalysisPanelAcousticTabContent = memo(function AiAnalysisPanelAcousticTabContent({
  activeTab,
  vadCacheLabel,
  model,
}: {
  activeTab: AnalysisBottomTab;
  vadCacheLabel: string;
  model: AiAnalysisPanelAcousticTabModel;
}) {
  return (
    <>
      <AiAnalysisPanelAcousticOverviewSection activeTab={activeTab} model={model} />
      <AiAnalysisPanelAcousticRuntimeSection
        activeTab={activeTab}
        model={model}
        vadCacheLabel={vadCacheLabel}
      />
      <AiAnalysisPanelAcousticInspectorSection activeTab={activeTab} model={model} />
      <AiAnalysisPanelAcousticDiagnosticsSection activeTab={activeTab} model={model} />
      <AiAnalysisPanelAcousticDescriptorSection activeTab={activeTab} model={model} />
      <AiAnalysisPanelAcousticSliceSection activeTab={activeTab} model={model} />
      <AiAnalysisPanelAcousticFormantSection activeTab={activeTab} model={model} />
      <AiAnalysisPanelAcousticToneSection activeTab={activeTab} model={model} />
      <AiAnalysisPanelAcousticHotspotsSection activeTab={activeTab} model={model} />
      <AiAnalysisPanelAcousticNavigationSection activeTab={activeTab} model={model} />
      <AiAnalysisPanelAcousticExportSection activeTab={activeTab} model={model} />
      <AiAnalysisPanelAcousticProviderSection activeTab={activeTab} model={model} />
    </>
  );
});
