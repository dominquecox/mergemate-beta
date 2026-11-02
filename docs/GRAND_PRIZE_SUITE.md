# Grand Prize suite review guide

The suite adds agent guardrail heuristics, local commute narration, recorded model-execution inspection, selectable visual targets and a morning Markdown brief.

Guardrail findings escalate the executive verdict. Ghost imports require dependency names from authenticated reads of manifests at the PR head; missing or unsupported manifest context is explicitly unavailable. Loaded patch coverage is disclosed. Findings are heuristics, not security or authentication certification.

Commute narration uses the existing readout flag, device voice and controller. It supports 1x/1.25x/1.5x, pause/resume/stop and cancels when the screen loses focus or the app backgrounds. Loaded text can be spoken locally; device voice availability and physical-device behavior require device smoke testing. Narration excludes raw code and sensitive links.

Execution inspection reports the actual serving provider/model, observed latency, reported token usage and request correlation. Missing usage stays absent; precision is not inferred. Cached evidence is labeled. The displayed JSON contains bounded, redacted validated response fields, never unrestricted prompts, images or model text. Sample fixtures are labeled and do not invent execution evidence.

Visual target sizes are estimates. The target popover copies `style={{ minHeight: 44, minWidth: 44 }}` for manual use; it does not modify a repository. OS feedback may be suppressed by device settings.

The morning brief includes successful triage decisions, removes undone decisions, excludes failed saves, and uses observed elapsed time. Clipboard errors do not report success. GitHub access remains read-only.

## Verification

Run workspace tests, `npm run typecheck`, `npm run lint`, then the mobile web export. Run web tests after export completes because the legal-page tests read generated HTML. With the export present, run:

```sh
node apps/mobile/scripts/check-grand-prize.mjs
```

The Chromium harness uses isolated same-origin HTTP and speech fixtures at 393px and 1440px. It checks escalation, audio lifecycle/rates, telemetry display, target-copy behavior and failure/undo-aware export. It proves browser behavior with fixtures, not live Meta execution or native speech/haptics. Screenshots are written to `/tmp/mergemate-grand-prize`.

Release requires the normal owner-operated dev release flow and subsequent signed-in live-provider and physical-device smoke tests. No live flags, provider configuration, production release or submission are part of this change.
