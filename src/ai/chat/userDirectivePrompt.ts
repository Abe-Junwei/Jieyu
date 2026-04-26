import type { AiSessionMemory } from './chatDomain.types';

function boolLabel(value: boolean | undefined): string {
  return value === true ? 'yes' : 'no';
}

export function buildUserDirectivePrompt(memory: AiSessionMemory): string {
  const lines: string[] = [];
  const nowMs = Date.now();
  const response = memory.responsePreferences;
  const tool = memory.toolPreferences;
  const safety = memory.safetyPreferences;

  if (response?.language && response.language !== 'auto') {
    lines.push(`- Output language: ${response.language === 'en' ? 'English' : 'Simplified Chinese'} for all user-visible natural-language replies, including tool summaries and continuation warnings.`);
  }
  if (response?.style) {
    lines.push(`- Response style: ${response.style}.`);
  }
  if (response?.format) {
    lines.push(`- Preferred response format: ${response.format}.`);
  }
  if (response?.evidenceRequired) {
    lines.push('- Include concise evidence/source notes when reporting project state or tool-derived results.');
  }
  if (tool?.defaultScope) {
    lines.push(`- Default tool scope when the user does not specify one: ${tool.defaultScope}.`);
  }
  if (tool?.autoExecute && tool.autoExecute !== 'allow') {
    lines.push(`- Tool execution preference: ${tool.autoExecute}. Do not silently auto-execute when this requires confirmation or clarification.`);
  }
  if (tool?.preferLocalReads) {
    lines.push('- Prefer local read tools before answering data-dependent questions.');
  }
  if (safety?.denyDestructive || safety?.denyBatch || safety?.requireImpactPreview) {
    lines.push(`- Safety preferences: denyDestructive=${boolLabel(safety.denyDestructive)}, denyBatch=${boolLabel(safety.denyBatch)}, requireImpactPreview=${boolLabel(safety.requireImpactPreview)}.`);
  }
  for (const item of memory.terminologyPreferences?.slice(-8) ?? []) {
    lines.push(`- Terminology: use "${item.target}" for "${item.source}".`);
  }
  for (const directive of (memory.sessionDirectives?.slice(-5) ?? [])) {
    if (directive.expiresAt) {
      const expiresMs = Date.parse(directive.expiresAt);
      if (Number.isFinite(expiresMs) && expiresMs <= nowMs) continue;
    }
    lines.push(`- Current-session directive: ${directive.text}`);
  }

  if (lines.length === 0) return '';
  return `[USER_DIRECTIVES]\nThese user directives are higher priority than generic style guidance, but lower priority than system safety rules.\n${lines.join('\n')}`;
}
