import { FeatureAvailabilityPanel } from '../components/FeatureAvailabilityPanel';

export function LexiconPage() {
  return (
    <FeatureAvailabilityPanel
      title="词典工作台未开放"
      summary="词条管理、义项编辑和语料反向关联尚未形成完整工作流，当前版本先明确降级为规划页。"
      scope={[
        '词条与义项管理',
        '词条到语料的反向引用',
        '词典导入导出与审核流',
      ]}
    />
  );
}
