import React, { memo } from 'react';
import { t, type Locale } from '../../i18n';
import {
  type DegradationScenario,
  type DegradationOverrideState,
  buildOverrideLabel,
  buildOverrideDescription,
  applyOverride,
  dismissOverride,
} from '../../ai/chat/degradationManualOverride';

interface AiChatDegradationOverrideProps {
  state: DegradationOverrideState;
  locale: Locale;
  onStateChange: (nextState: DegradationOverrideState) => void;
}

export const AiChatDegradationOverride = memo(function AiChatDegradationOverride({
  state,
  locale,
  onStateChange,
}: AiChatDegradationOverrideProps): React.JSX.Element {
  const { scenario, status } = state;
  const label = buildOverrideLabel(scenario, locale);
  const description = buildOverrideDescription(scenario, locale);

  const handleOverride = React.useCallback(() => {
    onStateChange(applyOverride(state, scenario));
  }, [onStateChange, state, scenario]);

  const handleDismiss = React.useCallback(() => {
    onStateChange(dismissOverride(state));
  }, [onStateChange, state]);

  // 已处理（接管或忽略）后仅展示 compact 状态
  if (status === 'overridden') {
    return (
      <div className="ai-chat-degradation-override ai-chat-degradation-override--overridden">
        <span className="ai-chat-degradation-override__status">✅ {label}</span>
      </div>
    );
  }

  if (status === 'dismissed') {
    return (
      <div className="ai-chat-degradation-override ai-chat-degradation-override--dismissed">
        <span className="ai-chat-degradation-override__status">⏹ {label}</span>
      </div>
    );
  }

  return (
    <div className="ai-chat-degradation-override ai-chat-degradation-override--pending">
      <span className="ai-chat-degradation-override__label" title={description}>
        {label}
      </span>
      <button
        className="ai-chat-degradation-override__btn ai-chat-degradation-override__btn--override"
        type="button"
        onClick={handleOverride}
      >
        {t(locale, 'msg.aiChat.degradation.takeOver')}
      </button>
      <button
        className="ai-chat-degradation-override__btn ai-chat-degradation-override__btn--dismiss"
        type="button"
        onClick={handleDismiss}
      >
        {t(locale, 'msg.aiChat.degradation.dismiss')}
      </button>
    </div>
  );
});

/**
 * 根据降级场景列表渲染一组接管组件。
 * 每个场景只渲染一次（去重）。
 */
export function useDegradationOverrides(
  scenarios: DegradationScenario[],
  messageId: string,
): {
  states: DegradationOverrideState[];
  setState: React.Dispatch<React.SetStateAction<DegradationOverrideState[]>>;
} {
  const uniqueScenarios = React.useMemo(
    () => Array.from(new Set(scenarios)),
    [scenarios],
  );
  const scenariosSignature = React.useMemo(
    () => uniqueScenarios.join('|'),
    [uniqueScenarios],
  );

  const [states, setState] = React.useState<DegradationOverrideState[]>(() =>
    uniqueScenarios.map((s) => ({
      scenario: s,
      messageId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    })),
  );

  React.useEffect(() => {
    setState((prev) => {
      const next = uniqueScenarios.map((s) => ({
        scenario: s,
        messageId,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
      }));
      if (
        prev.length === next.length
        && prev.every((item, index) => item.scenario === next[index]?.scenario && item.messageId === messageId && item.status === 'pending')
      ) {
        return prev;
      }
      return next;
    });
  }, [messageId, scenariosSignature, uniqueScenarios]);

  return { states, setState };
}
