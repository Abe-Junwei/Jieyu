import type {
  AiResponsePreferenceFormat,
  AiResponsePreferenceLanguage,
  AiToolAutoExecutePreference,
  AiUserDirectiveCategory,
  AiUserDirectiveScope,
  AiUserDirectiveSource,
  LocalUnitScope,
} from '../chat/chatDomain.types';

export type ExtractedUserDirective =
  | {
      id: string;
      category: 'response';
      scope: AiUserDirectiveScope;
      source: AiUserDirectiveSource;
      text: string;
      confidence: number;
      targetPath: 'responsePreferences.language';
      value: AiResponsePreferenceLanguage;
      sourceMessageId?: string;
    }
  | {
      id: string;
      category: 'response';
      scope: AiUserDirectiveScope;
      source: AiUserDirectiveSource;
      text: string;
      confidence: number;
      targetPath: 'responsePreferences.style';
      value: 'concise' | 'detailed';
      sourceMessageId?: string;
    }
  | {
      id: string;
      category: 'response';
      scope: AiUserDirectiveScope;
      source: AiUserDirectiveSource;
      text: string;
      confidence: number;
      targetPath: 'responsePreferences.format';
      value: AiResponsePreferenceFormat;
      sourceMessageId?: string;
    }
  | {
      id: string;
      category: 'response';
      scope: AiUserDirectiveScope;
      source: AiUserDirectiveSource;
      text: string;
      confidence: number;
      targetPath: 'responsePreferences.evidenceRequired';
      value: boolean;
      sourceMessageId?: string;
    }
  | {
      id: string;
      category: 'tool';
      scope: AiUserDirectiveScope;
      source: AiUserDirectiveSource;
      text: string;
      confidence: number;
      targetPath: 'toolPreferences.defaultScope';
      value: LocalUnitScope;
      sourceMessageId?: string;
    }
  | {
      id: string;
      category: 'tool';
      scope: AiUserDirectiveScope;
      source: AiUserDirectiveSource;
      text: string;
      confidence: number;
      targetPath: 'toolPreferences.autoExecute';
      value: AiToolAutoExecutePreference;
      sourceMessageId?: string;
    }
  | {
      id: string;
      category: 'tool';
      scope: AiUserDirectiveScope;
      source: AiUserDirectiveSource;
      text: string;
      confidence: number;
      targetPath: 'toolPreferences.preferLocalReads';
      value: boolean;
      sourceMessageId?: string;
    }
  | {
      id: string;
      category: 'safety';
      scope: AiUserDirectiveScope;
      source: AiUserDirectiveSource;
      text: string;
      confidence: number;
      targetPath: 'safetyPreferences.denyDestructive' | 'safetyPreferences.denyBatch' | 'safetyPreferences.requireImpactPreview';
      value: boolean;
      sourceMessageId?: string;
    }
  | {
      id: string;
      category: 'terminology';
      scope: AiUserDirectiveScope;
      source: AiUserDirectiveSource;
      text: string;
      confidence: number;
      targetPath: 'terminologyPreferences';
      value: string;
      sourceTerm: string;
      targetTerm: string;
      sourceMessageId?: string;
    }
  | {
      id: string;
      category: 'session';
      scope: 'session';
      source: AiUserDirectiveSource;
      text: string;
      confidence: number;
      targetPath: 'sessionDirectives';
      value: string;
      sourceMessageId?: string;
    };

export interface ExtractUserDirectivesInput {
  userText: string;
  source?: AiUserDirectiveSource;
  sourceMessageId?: string;
  now?: Date;
}

function normalizeText(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

function newDirectiveId(category: AiUserDirectiveCategory, targetPath: string, text: string, now: Date): string {
  const slug = `${targetPath}:${text}`.toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/giu, '-').replace(/^-|-$/g, '').slice(0, 32);
  return `directive_${category}_${now.getTime().toString(36)}_${slug || Math.random().toString(36).slice(2, 8)}`;
}

function stripMemoryPrefix(text: string): { body: string; scope: AiUserDirectiveScope } {
  const normalized = normalizeText(text);
  const longTermPatterns = [
    /^(?:请)?记住[，,：:\s]+(.+)$/u,
    /^以后[，,：:\s]*(.+)$/u,
    /^默认[，,：:\s]*(.+)$/u,
    /^from now on[,\s]+(.+)$/iu,
    /^remember(?: that)?[,\s:]+(.+)$/iu,
    /^please remember(?: that)?[,\s:]+(.+)$/iu,
    /^by default[,\s]+(.+)$/iu,
  ];
  for (const pattern of longTermPatterns) {
    const match = normalized.match(pattern);
    const body = match?.[1]?.trim();
    if (body) return { body, scope: 'long_term' };
  }
  const sessionPatterns = [
    /^(?:本轮|这轮|本次|这次|当前会话)[，,：:\s]*(.+)$/u,
    /^for this (?:session|turn|chat)[,\s]+(.+)$/iu,
  ];
  for (const pattern of sessionPatterns) {
    const match = normalized.match(pattern);
    const body = match?.[1]?.trim();
    if (body) return { body, scope: 'session' };
  }
  return { body: normalized, scope: 'session' };
}

function hasEnglishLanguagePreference(text: string): boolean {
  return /(英文|英语|English|in English|respond in English|answer in English|use English|用英文|用英语)/iu.test(text);
}

function hasChineseLanguagePreference(text: string): boolean {
  return /(中文|汉语|Chinese|in Chinese|respond in Chinese|answer in Chinese|use Chinese|用中文|用汉语)/iu.test(text);
}

function inferDefaultScope(text: string): LocalUnitScope | null {
  if (/(当前音频|这条音频|当前轨道|current audio|current track|this audio|this track)/iu.test(text)) return 'current_track';
  if (/(当前范围|当前选区|当前语段|当前层|current scope|current selection|selected)/iu.test(text)) return 'current_scope';
  if (/(整个项目|全项目|全局|whole project|project[-\s]*wide|global)/iu.test(text)) return 'project';
  return null;
}

function inferTerminology(text: string): { sourceTerm: string; targetTerm: string } | null {
  const patterns = [
    /^把\s*(.+?)\s*(?:叫做|叫|称为)\s*(.+)$/u,
    /^(.+?)\s*(?:统一译为|译为|翻译成)\s*(.+)$/u,
    /^call\s+(.+?)\s+(.+)$/iu,
    /^translate\s+(.+?)\s+as\s+(.+)$/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const sourceTerm = match?.[1]?.trim();
    const targetTerm = match?.[2]?.trim();
    if (sourceTerm && targetTerm && sourceTerm.length <= 60 && targetTerm.length <= 60) {
      return { sourceTerm, targetTerm };
    }
  }
  return null;
}

export function extractUserDirectives(input: ExtractUserDirectivesInput): ExtractedUserDirective[] {
  const now = input.now ?? new Date();
  const source = input.source ?? 'user_explicit';
  const lines = input.userText
    .split(/\n+/)
    .map((line) => stripMemoryPrefix(line))
    .filter((item) => item.body.length > 0);
  const directives: ExtractedUserDirective[] = [];

  const push = (directive: Omit<ExtractedUserDirective, 'id' | 'source' | 'sourceMessageId'>): void => {
    const full = {
      ...directive,
      id: newDirectiveId(directive.category, directive.targetPath, directive.text, now),
      source,
      ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
    } as ExtractedUserDirective;
    directives.push(full);
  };

  for (const { body, scope } of lines) {
    const text = normalizeText(body);
    if (hasEnglishLanguagePreference(text)) {
      push({ category: 'response', scope, text, confidence: 0.96, targetPath: 'responsePreferences.language', value: 'en' });
    } else if (hasChineseLanguagePreference(text)) {
      push({ category: 'response', scope, text, confidence: 0.96, targetPath: 'responsePreferences.language', value: 'zh-CN' });
    }

    if (/(简洁|短一点|少解释|concise|short|brief)/iu.test(text)) {
      push({ category: 'response', scope, text, confidence: 0.88, targetPath: 'responsePreferences.style', value: 'concise' });
    } else if (/(详细|展开|detailed|more detail)/iu.test(text)) {
      push({ category: 'response', scope, text, confidence: 0.82, targetPath: 'responsePreferences.style', value: 'detailed' });
    }

    if (/(先给结论|先说结论|证据|引用|evidence|cite|source)/iu.test(text)) {
      push({ category: 'response', scope, text, confidence: 0.84, targetPath: 'responsePreferences.evidenceRequired', value: true });
      push({ category: 'response', scope, text, confidence: 0.78, targetPath: 'responsePreferences.format', value: 'evidence_first' });
    } else if (/(分步骤|步骤|step by step|steps)/iu.test(text)) {
      push({ category: 'response', scope, text, confidence: 0.8, targetPath: 'responsePreferences.format', value: 'steps' });
    } else if (/(不要分点|别分点|prose|paragraph)/iu.test(text)) {
      push({ category: 'response', scope, text, confidence: 0.8, targetPath: 'responsePreferences.format', value: 'prose' });
    } else if (/(分点|bullet|bullets)/iu.test(text)) {
      push({ category: 'response', scope, text, confidence: 0.78, targetPath: 'responsePreferences.format', value: 'bullets' });
    }

    const defaultScope = inferDefaultScope(text);
    if (defaultScope && /(默认|以后|优先|只看|scope|by default|prefer)/iu.test(text)) {
      push({ category: 'tool', scope, text, confidence: 0.9, targetPath: 'toolPreferences.defaultScope', value: defaultScope });
    }
    if (/(执行前.*问|先问我|不要自动执行|ask me first|confirm before|before executing)/iu.test(text)) {
      push({ category: 'tool', scope, text, confidence: 0.9, targetPath: 'toolPreferences.autoExecute', value: 'ask_first' });
    } else if (/(不要调用工具|不要执行工具|只给建议|never execute|do not execute tools|no tools)/iu.test(text)) {
      push({ category: 'tool', scope, text, confidence: 0.9, targetPath: 'toolPreferences.autoExecute', value: 'never' });
    }
    if (/(优先本地|先查本地|prefer local|local reads first)/iu.test(text)) {
      push({ category: 'tool', scope, text, confidence: 0.82, targetPath: 'toolPreferences.preferLocalReads', value: true });
    }

    if (/(不要删除|禁止删除|别删除|do not delete|never delete)/iu.test(text)) {
      push({ category: 'safety', scope, text, confidence: 0.95, targetPath: 'safetyPreferences.denyDestructive', value: true });
    }
    if (/(不要批量|禁止批量|别批量|no batch|do not batch)/iu.test(text)) {
      push({ category: 'safety', scope, text, confidence: 0.9, targetPath: 'safetyPreferences.denyBatch', value: true });
    }
    if (/(先解释影响|影响范围|impact preview|explain impact)/iu.test(text)) {
      push({ category: 'safety', scope, text, confidence: 0.86, targetPath: 'safetyPreferences.requireImpactPreview', value: true });
    }

    const terminology = inferTerminology(text);
    if (terminology) {
      directives.push({
        id: newDirectiveId('terminology', 'terminologyPreferences', text, now),
        category: 'terminology',
        scope,
        text,
        confidence: 0.82,
        targetPath: 'terminologyPreferences',
        value: `${terminology.sourceTerm}=>${terminology.targetTerm}`,
        sourceTerm: terminology.sourceTerm,
        targetTerm: terminology.targetTerm,
        source,
        ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
      });
    }

    if (scope === 'session' && /(只审查|不改代码|不修改|只读|review only|do not edit|read only|readonly)/iu.test(text)) {
      push({ category: 'session', scope: 'session', text, confidence: 0.92, targetPath: 'sessionDirectives', value: text });
      push({ category: 'tool', scope: 'session', text, confidence: 0.86, targetPath: 'toolPreferences.autoExecute', value: 'never' });
    }
  }

  const seen = new Set<string>();
  return directives.filter((directive) => {
    const key = `${directive.targetPath}:${String(directive.value)}:${directive.scope}:${directive.sourceMessageId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
