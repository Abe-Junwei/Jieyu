/**
 * Single-file rules under `src/services/**` (ratchet + requiredRegex anchors).
 * Phase 0.4 — split from `architecture-guard.config.mjs`.
 */
export const architectureGuardServiceFileRules = [
  {
    file: 'src/services/VoiceAgentService.ts',
    maxLines: 1100,
    requiredRegexes: [
      /export class VoiceAgentService extends BrowserEventEmitter<VoiceAgentServiceEventMap>/,
      /VoiceAgentService\.singleton\.ts \(not barrel-re-exported here/,
      /from '\.\/VoiceAgentService\.sttResultDispatch'/,
      /dispatchVoiceAgentServiceSttResult\(/,
    ],
  },
  {
    file: 'src/services/VoiceAgentService.singleton.ts',
    maxLines: 80,
    requiredRegexes: [
      /export function getVoiceAgentService\(\): VoiceAgentService \| null \{/,
      /export async function createVoiceAgentService\(options: VoiceAgentServiceOptions = \{\}\): Promise<VoiceAgentService> \{/,
    ],
  },
  {
    file: 'src/services/VoiceInputService.ts',
    maxLines: 650,
    requiredRegexes: [
      /export class VoiceInputService \{/,
      /private readonly engineSwitchCoordinator = new VoiceInputEngineSwitchCoordinator\(\);/,
      /private get fallbackChain\(\): SttEngine\[\] \{/,
      /return buildSttFallbackChain\(this\._config\.region\);/,
    ],
  },
  {
    file: 'src/services/GlobalContextService.ts',
    maxLines: 390,
    maxUseCallbackDecls: 1,
    maxUseMemoDecls: 0,
    maxUseEffects: 2,
  },
];
