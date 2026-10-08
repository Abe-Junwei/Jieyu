import type { ReactElement } from 'react';
import { t, type Locale } from '../i18n';
import { JIEYU_DATA_FROZEN } from '../config/dataFreeze';

export type DevBuildBannerProps = {
  locale: Locale;
  /** 默认读取 `JIEYU_DATA_FROZEN`；测试可注入 | defaults to `JIEYU_DATA_FROZEN`; injectable for tests */
  frozen?: boolean;
};

/**
 * T56 / D14：冻结之前常驻的“开发期版本”提示；冻结标记为真后不再渲染。
 * T56 / D14: persistent dev-build notice before the data freeze point; hidden once frozen.
 */
export function DevBuildBanner({
  locale,
  frozen = JIEYU_DATA_FROZEN,
}: DevBuildBannerProps): ReactElement | null {
  if (frozen) return null;
  return (
    <div className="app-dev-build-banner" role="note" data-testid="app-dev-build-banner">
      {t(locale, 'app.devBuildBanner.message')}
    </div>
  );
}
