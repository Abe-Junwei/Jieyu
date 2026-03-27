import { FeatureAvailabilityPanel } from '../components/FeatureAvailabilityPanel';

export function AnalysisPage() {
  return (
    <FeatureAvailabilityPanel
      title="分析工作台未开放"
      summary="统计视图、AI 审计队列与质量评估还未达到可独立交付标准，因此暂时保留为说明页。"
      scope={[
        '统计视图与质量概览',
        'AI 审计与回放队列',
        '质检规则与异常聚合',
      ]}
    />
  );
}
