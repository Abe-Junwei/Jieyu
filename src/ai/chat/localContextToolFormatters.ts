import type { LocalContextToolResult } from './localContextToolTypes';
import {
  applyLocalToolResultCharBudget,
  TOOL_RESULT_TRUNCATION_WARNING,
} from './formatters/agentLoopPayload';
import { formatStructuredLocalToolAnswer } from './formatters/structuredAnswer';
import {
  isZhLocale,
  asObjectRecord,
  summarizeLocalContextToolResult,
  humanizeScope,
} from './formatters/summarizers';

export { buildAgentLoopContinuationToolPayload } from './formatters/agentLoopPayload';

export function formatLocalContextToolResultMessage(
  result: LocalContextToolResult,
  locale: string = 'en-US',
  userText = '',
): string {
  const payload = result.ok
    ? JSON.stringify(result.result, null, 2)
    : JSON.stringify({ error: result.error ?? 'unknown_error', result: result.result }, null, 2);
  const { truncated } = applyLocalToolResultCharBudget(payload, {
    scope: 'single',
    toolName: result.name,
  });
  const summary = formatStructuredLocalToolAnswer(result, locale, userText);
  return truncated ? `${summary}${TOOL_RESULT_TRUNCATION_WARNING}` : summary;
}

export function formatLocalContextToolBatchResultMessage(
  results: LocalContextToolResult[],
  locale: string = 'en-US',
  userText = '',
): string {
  const payload = JSON.stringify(results, null, 2);
  const { truncated } = applyLocalToolResultCharBudget(payload, { scope: 'batch' });
  const zh = isZhLocale(locale);
  const successCount = results.filter((item) => item.ok).length;
  const failedCount = results.length - successCount;
  const evidence = results
    .slice(0, 2)
    .map((item) => summarizeLocalContextToolResult(item, locale, userText).replace(/[。.]$/, ''))
    .join(zh ? '；' : '; ');
  const scopeLabels = Array.from(
    new Set(
      results.map((item) => {
        const body = asObjectRecord(item.result);
        return item.name === 'get_current_selection'
          ? zh
            ? '当前上下文'
            : 'current context'
          : humanizeScope(body?.scope, locale);
      }),
    ),
  );
  const summary = [
    `${zh ? '结论：' : 'Conclusion: '}${zh ? `已完成 ${results.length} 项本地查询，其中成功 ${successCount} 项。` : `Completed ${results.length} local lookups, with ${successCount} successful.`}`,
    `${zh ? '证据：' : 'Evidence: '}${evidence || (zh ? '当前批次没有返回更多细节。' : 'This batch did not return extra detail.')}`,
    `${zh ? '范围：' : 'Scope: '}${scopeLabels.join(zh ? '、' : ', ')}`,
    `${zh ? '不确定项：' : 'Uncertainty: '}${
      failedCount > 0
        ? zh
          ? `仍有 ${failedCount} 项需要进一步澄清或重试。`
          : `${failedCount} items still need clarification or retry.`
        : zh
          ? '当前批次未发现明显冲突。'
          : 'No obvious conflict was found in this batch.'
    }`,
    `${zh ? '建议下一步：' : 'Suggested next step: '}${
      failedCount > 0
        ? zh
          ? '先缩小范围或补充关键词，我可以继续处理失败项。'
          : 'First narrow the scope or add a keyword, and I can continue with the failed items.'
        : zh
          ? '如果需要，我可以继续展开某一项的详情。'
          : 'If needed, I can now expand the details of any one result.'
    }`,
  ].join('\n');
  return truncated ? `${summary}${TOOL_RESULT_TRUNCATION_WARNING}` : summary;
}
