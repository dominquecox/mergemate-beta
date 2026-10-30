// Barrel: the AI engine lives in the ai-engine-* modules; this keeps every import path working.
export {
  type AiActionLimits,
  type AiDeps,
  type AiRunResult,
  type AiStores,
  type BudgetCheck,
  type ResultCache,
  type UsageReservation,
  type UsageStore,
  actionHeaders,
  actionLimits,
  cacheKey,
  claimWork,
  createDbCache,
  createDbUsageStore,
  noStore,
  policyWorkKey,
  releaseWork,
  runModelTask,
  secondsToMidnight,
  storesFor,
  userKey,
  withReservation,
} from "./ai-engine-gate";
export {
  HIGHLIGHT_MAX_TOKENS,
  HIGHLIGHT_SYSTEM,
  type HighlightRunResult,
  analyzeHighlight,
  buildHighlightPrompt,
} from "./ai-engine-highlight";
export {
  DATA_NOTICE,
  RISK_MAX_TOKENS,
  RISK_SYSTEM,
  SUMMARY_MAX_TOKENS,
  SUMMARY_SYSTEM,
  buildPrPrompt,
  createFetchTransport,
  responsesOutputText,
  stripCodeFences,
} from "./ai-engine-model";
export {
  FIXTURE_PR,
  FIXTURE_RISK,
  FIXTURE_SUMMARY,
  FIXTURE_TRIAGE,
  type PrData,
  type PrDataSource,
  type PrRefParts,
  checksOutcome,
  githubPrDataSource,
  isBotLogin,
  prRefString,
  toPrData,
} from "./ai-engine-pr-data";
export {
  assessPrRisk,
} from "./ai-engine-risk";
export {
  type PrFileInput,
  assignsCredential,
  buildDiffContext,
  redactSecrets,
  scanPatch,
} from "./ai-engine-scan";
export {
  type QualitySignalInput,
  type RiskSignalInput,
  assessQuality,
  assessRiskSignals,
  commonSignals,
  containsTodo,
  maxLevel,
  scoreTriageLane,
} from "./ai-engine-signals";
export {
  summarizePr,
} from "./ai-engine-summary";
export {
  VOICE_CONTENT_TYPES,
  VOICE_NOTE_MAX_BYTES,
  VOICE_NOTE_MAX_SECONDS,
  type VoiceAudioType,
  type VoiceNoteRunResult,
  type WavInfo,
  detectVoiceAudioType,
  readWavInfo,
  transcribeVoiceNote,
} from "./ai-engine-voice";
