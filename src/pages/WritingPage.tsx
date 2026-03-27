import { FeatureAvailabilityPanel } from '../components/FeatureAvailabilityPanel';

export function WritingPage() {
  return (
    <FeatureAvailabilityPanel
      title="写作工作台未开放"
      summary="参考语法章节编排与语料引文写作仍处于规划中，当前不再以可用页面对外暴露。"
      scope={[
        '章节组织与提纲管理',
        '语料引文插入与回链',
        '写作模板与导出流程',
      ]}
    />
  );
}
