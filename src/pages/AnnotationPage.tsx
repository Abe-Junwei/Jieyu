import { FeatureAvailabilityPanel } from '../components/FeatureAvailabilityPanel';

export function AnnotationPage() {
  return (
    <FeatureAvailabilityPanel
      title="标注工作台未开放"
      summary="词切分、语素 gloss、标签标注仍在能力收口阶段，当前版本不再将该页作为已交付功能展示。"
      scope={[
        '词切分与 token 级编辑',
        'gloss 词库联动与批量修订',
        '标签体系与语料回链',
      ]}
    />
  );
}
