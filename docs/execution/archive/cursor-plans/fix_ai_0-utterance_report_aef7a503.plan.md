---
name: Fix AI prompt scope ambiguity
overview: "Comprehensive fix for prompt design flaws that cause the AI model to misinterpret data scopes. Covers scope labeling, field naming, hallucination detector baseline, tool guide, and rendering clarity."
todos:
  - id: scope-labels
    content: "A: Add projectUtteranceCount to ShortTerm; fix utterancesOnCurrentMediaCount label; rename selectedUtteranceStartSec/EndSec"
    status: pending
  - id: hallucination-fix
    content: "B: Fix hallucination detector to use project count as baseline, not media count"
    status: pending
  - id: tool-guide
    content: "C: Expand buildLocalContextToolGuide with return shapes, count/total, truncation, fallback"
    status: pending
  - id: tool-result-scope
    content: "D: Add projectUtteranceCount to get_current_selection; add scope label to tool result messages"
    status: pending
  - id: persona-update
    content: "E: Rewrite persona scope rules; strengthen projectUtteranceCount as authoritative"
    status: pending
  - id: run-checks
    content: "F: Update tests, run tsc and vitest"
    status: pending
isProject: false
---

# Fix: AI prompt scope ambiguity -- comprehensive remediation

## Problem Summary

The AI model receives data at three different scopes -- **project**, **current audio track**, **user selection** -- but the prompt design fails to make these scopes distinguishable. This causes the model to misinterpret counts, confuse IDs, and make incorrect assertions about project state.

## Full Audit Findings

### A. Scope Confusion (Critical) -- 5 issues

**A1. `utterancesOnCurrentMediaCount` vs project count (root cause of "0 语段" bug)**
- ShortTerm: `utterancesOnCurrentMediaCount=0 [authoritative — current actual count]` -- media-scoped but labeled as authoritative
- LongTerm: `projectStats(utterances=4, ...)` -- project-scoped but buried, no emphasis
- Model conflates media count with project total

**A2. `selectedUtteranceStartSec`/`EndSec` is misnamed**
- Built from `selectionSnapshot.selectedUnitStartSec`/`EndSec` which can be a **segment** (not utterance) time range
- Model may assume these are always utterance bounds

**A3. `utteranceTimeline` sounds project-wide**
- Actually only covers utterances on current media (`buildUtteranceTimelineDigest(utterancesOnCurrentMedia)`)
- Uses `#1, #2` indices that look like IDs but are just digest line numbers -- model may confuse with real utterance IDs

**A4. `get_current_selection` returns media count without project context**
- Returns `utterancesOnCurrentMediaCount` in result but no `projectUtteranceCount`
- If model only calls this tool (no `get_project_stats`), it has no project-level baseline

**A5. Hallucination detector uses wrong baseline**
- `appendHallucinationWarningIfSuspicious` compares model's claimed count against `utterancesOnCurrentMediaCount` (media-scoped)
- If model correctly says "项目共 4 个语段" but media has 0 → **false alarm** (adds warning to correct answer)
- If model incorrectly says "共 0 个语段" and media also has 0 → **missed detection** (lets real error through)

### B. Naming Ambiguity (Medium) -- 4 issues

**B1. "Unit" overload across three fields**
- `activeUtteranceUnitId`, `activeSegmentUnitId`, `selectedUnitIds` all use "Unit" -- model must cross-reference `selectedUnitKind` to disambiguate
- `selectedUnitIds` can contain either utterance or segment IDs

**B2. Three layer ID pointers**
- `selectedLayerId`, `selectedTranslationLayerId`, `selectedTranscriptionLayerId` -- model may not know which to use for tool `layerId` parameter

**B3. `textId` vs `id` on utterances**
- Tools return both `id` and `textId` on utterance rows -- no explanation of what `textId` means
- Model may confuse which is the canonical identifier

**B4. `list_utterances` `count` vs `total`**
- `count` = page size (matches this page), `total` = full list length
- Tool guide doesn't explain this; model may treat `count` as project total

### C. Rendering / Visibility (Medium) -- 3 issues

**C1. `projectStats` in LongTerm uses dense parenthetical format**
- `projectStats(utterances=4, translationLayers=0, aiConfidenceAvg=n/a)` -- key data crammed into one line
- Model may skip or misparse the parenthetical

**C2. `waveformAnalysis` mixes global and selection scopes without prefix**
- `gaps=3, selectionGaps=1` -- only the "selection" prefix distinguishes; `gaps` alone implies global but is actually media-scoped

**C3. `acousticSummary` is one ~400-char dense line**
- 15+ fields in one parenthetical; cognitive overload for model
- Key facts like `selectionSec` range compete with `mfcc` coefficients

### D. Tool Guide Gaps (Low-Medium) -- 4 issues

**D1. No return shapes in guide**
- `buildLocalContextToolGuide` gives argument examples only; model doesn't know result structure

**D2. `count` vs `total` not documented**
- `list_utterances` returns both; model may misuse

**D3. Truncation behavior not documented**
- 2000-char JSON truncation can break JSON mid-field; model may parse garbage after truncation point

**D4. `search_utterances` `list_fallback` mode not documented**
- Empty query delegates to listing; result includes `mode: 'list_fallback'` not mentioned in guide

## Fix Plan

### Fix A: Scope labels in `[CONTEXT]` block

**Files:** [chatDomain.types.ts](src/ai/chat/chatDomain.types.ts), [TranscriptionPage.aiPromptContext.ts](src/pages/TranscriptionPage.aiPromptContext.ts), [promptContext.ts](src/ai/chat/promptContext.ts)

1. Add `projectUtteranceCount` to `AiShortTermContext` type
2. Populate it in `buildTranscriptionAiPromptContext` from `utteranceCount` param
3. Add ShortTerm template **before** `utterancesOnCurrentMediaCount`:

```typescript
{ key: 'projectUtteranceCount',
  render: (v) => typeof v === 'number' && Number.isFinite(v)
    ? `project.utteranceCount=${v} [authoritative — total in project]` : null },
```

4. Change `utterancesOnCurrentMediaCount` label:

```
currentTrack.utteranceCount=${v} [current audio track only]
```

5. Rename `selectedUtteranceStartSec`/`EndSec` to `selectedUnitStartSec`/`EndSec` in template rendering (matches source field name; fixes A2)

### Fix B: Hallucination detector baseline

**File:** [useAiChat.streamCompletion.ts](src/hooks/useAiChat.streamCompletion.ts)

Change `appendHallucinationWarningIfSuspicious` to prefer `projectUtteranceCount` over `utterancesOnCurrentMediaCount`:

```typescript
const expected = context?.shortTerm?.projectUtteranceCount
  ?? context?.longTerm?.projectStats?.utteranceCount
  ?? context?.shortTerm?.utterancesOnCurrentMediaCount;
```

### Fix C: Expand tool guide

**File:** [localContextTools.ts](src/ai/chat/localContextTools.ts) `buildLocalContextToolGuide`

Add return shape hints and key caveats:

```
- list_utterances → {total, count (page size), offset, limit, sort, matches[]}
- search_utterances → {query, count, matches[]} (empty query = list fallback)
- get_project_stats → {utteranceCount (project total), translationLayerCount, aiConfidenceAvg}
- get_current_selection → ShortTerm snapshot (currentTrack scope, not project total)
- Results are JSON, may be truncated at 2000 chars — do NOT invent data beyond what is returned.
```

### Fix D: Tool result scope labeling

**File:** [localContextTools.ts](src/ai/chat/localContextTools.ts)

1. `get_current_selection`: inject `projectUtteranceCount` from `context.longTerm?.projectStats?.utteranceCount` into result alongside the existing ShortTerm fields
2. `formatLocalContextToolResultMessage`: add scope hint in header line:

```
Local context tool executed: list_utterances [scope: project]
```

### Fix E: Persona scope rules

**File:** [promptContext.ts](src/ai/chat/promptContext.ts) `AI_SYSTEM_PERSONAS.transcription`

Replace the current line 54 with clearer scope rules:

```
project.utteranceCount 是全项目语段总数（权威值）；currentTrack.utteranceCount 仅是当前音频轨道上的语段数。
当用户问"有多少语段"时，优先引用 project.utteranceCount。
list_utterances / search_utterances 返回的是全项目数据，不局限于当前音轨。
selectedUnitIds 是用户当前选中的语段/片段，不等于全部语段。
```

### Fix F: Tests and verification

- Update [TranscriptionPage.aiPromptContext.test.ts](src/pages/TranscriptionPage.aiPromptContext.test.ts): verify `projectUtteranceCount` in shortTerm
- Verify rendered `[CONTEXT]` block has both `project.utteranceCount` and `currentTrack.utteranceCount`
- Verify hallucination detector uses project count
- Run `tsc --noEmit` and related vitest suites
