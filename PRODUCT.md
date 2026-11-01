# Product

<!-- impeccable:product-schema 1 -->

## Platform

Electron desktop

## Users

Primary users are field linguists documenting and organizing endangered-language materials. Typical job: keep one field trip’s work in a single local workspace through recording, transcription, annotation, lexicon, corpus, and export. Teaching or archival audiences are not confirmed as primary.

## Product Purpose

解语 (Jieyu) is local-first software for endangered-language documentation. Success means a researcher can complete the fieldwork pipeline on their own machine without depending on a browser product promise, then export or exchange project-scoped material when needed.

## Positioning

One local workspace covers the pipeline end-to-end (record → transcribe → annotate → lexicon → corpus → export). Collaboration, when used, syncs project-scoped snapshots rather than treating the cloud as the system of record. Neighboring tools (e.g. ELAN, Toolbox, lameta) typically specialize in a stage; Jieyu’s claim is the integrated local pipeline. AI-assisted transcription/annotation and corpus RAG exist in the product surface but are supporting mechanisms, not the sole differentiator recorded here.

## Operating Context

- Electron desktop is the supported runtime (ADR-0063); browser builds remain for development and tests only—no browser support promise.
- Desktop storage path: project folder + SQLite. First release targets new projects; legacy browser migration is not a release blocker (ADR-0086). Existing user data remains protected.
- Core workspace surfaces include transcription timeline, annotation, lexicon, corpus library, language metadata, and export/exchange flows.
- User-facing copy goes through i18n (`dictKeys` / dictionaries); Chinese is a first-class UI language.
- Academic citation: see `CITATION.cff` (author Bai Junwei / Abe-Junwei, Beijing Normal University).

## Capabilities and Constraints

- Capabilities (confirmed in product docs): audio-linked transcription timelines; annotation; project lexicon; corpus library; language metadata; import/export of common field formats; optional AI assistance and project corpus RAG; desktop shell with local project files.
- Constraints: desktop-only product commitment after Electron skeleton (ADR-0063); do not invent browser support; collaboration keys/telemetry stripped from desktop builds where ADR-0047 applies; visual tokens live in `src/styles/tokens.css` / `src/utils/theme.ts` (not restated as a visual world here).
- Open / undecided for this record: detailed brand voice guidelines beyond the name and citation; which collaboration model is the long-term product default (server-less sync vs later self-hosted) beyond current snapshot framing; commercial packaging and pricing (none claimed).

## Brand Commitments

- Product name: 解语 / Jieyu.
- Copyright: 沂南灵创技术服务中心 (ISC), see root `LICENSE`.
- No binding aesthetic/visual brand system is recorded in this file; design tokens and Stitch handoff live in `DESIGN.md` and code.

## Evidence on Hand

- Root `README.md`, `CITATION.cff`, `DESIGN.md`, `user-guide/`, `docs/adr/` (especially ADR-0063 desktop-only).
- Public repo: https://github.com/Abe-Junwei/Jieyu
- Do not fabricate testimonials, customer logos, benchmarks, pricing, or deployment SLAs.

## Product Principles

1. Local-first: the researcher’s machine holds the working project; network is optional for exchange/collaboration slices.
2. Pipeline coherence: prefer one workspace across recording through export over stage-siloed tools.
3. Field honesty: only claim formats, platforms, and collaboration behavior that ADRs and shipping code support.
4. Scholarly usability: terminology, citation, and i18n stay aligned with linguistic documentation practice.
5. Desktop product surface: ship and verify for Electron; keep browser paths as engineering aids, not a second product.

## Accessibility & Inclusion

No product-specific accessibility standard was confirmed in this init pass beyond general UI i18n. Record later when requirements are set.

## First-release Acceptance

The confirmed desktop product and design contract is [ADR-0099](docs/adr/0099-desktop-product-design-and-release-contract.md); operational evidence belongs in the [release checklist](docs/execution/release-gates/desktop-product-design-acceptance.md). These are requirements, not claims of shipped functionality.

- One desktop shell preserves project, manuscript, layer and segment context. Ordinary edits autosave; failures retain drafts and block project changes or closing until resolved or explicitly discarded. Destructive operations require impact review and confirmation.
- Sentence-aligned IGT is the primary word/morpheme/gloss editor; the timeline edits utterances and timing with valid cross-track speaker overlap. Changed source text makes prior analysis pending review, excluded from valid analysis use until correspondence is repaired and validated.
- A complete professional lexicon editor covering the existing model's editable fields, and a professional query language for order, adjacency, cross-layer and bounded within-manuscript cross-segment relations, are first-release blockers. Visual and textual queries preserve meaning; execution excludes concurrent writes and supports confirmed cancellation.
- AI remains optional. Suggestions require review, survive project reopening, and are version-checked before atomic acceptance. Model downloads, persistent model management, transcoding and bundled delivery remain deferred under ADR-0098.
- The offline manual pipeline starts from importing existing recordings and ends in verified local export. Full field recording capture is not a first-release blocker. Supported formats require Electron-path evidence and explicit disclosure of loss; project packages and backups have distinct purposes.
- Core flows require keyboard/focus, light/dark contrast, font scaling and reduced-motion verification. Narrow layouts collapse the inspector before context while preserving selection and focus.
