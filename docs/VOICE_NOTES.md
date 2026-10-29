# Voice notes and durable private notes (J-006)

Voice recording is optional and defaults off. No live switch was changed. A signed-in, non-demo user with current AI consent can record, pause/resume, stop, play, transcribe, edit the returned text, and explicitly save. Notes reopen on the same PR or in the user's Highlight workspace. Highlight notes are workspace notes, not retained screenshot attachments. Notes are never GitHub comments.

## Storage and boundaries

Append-only migration0014_private_notes.sql is **not remotely applied**;0013 is reserved by J-005 PR125. Notes belong to a user via an ON DELETE CASCADE foreign key. The user/UUID primary key makes identical save retries idempotent and rejects different content under the same UUID. Each context allows100 notes, each up to8000 characters. Every PR-context read/save/delete rechecks current GitHub access using that user's token. Highlight notes are account-private. Text renders plainly; responses are no-store.

No recording or transcript is automatically saved. Server audio stays in bounded memory. Capture uses memory; native playback uses an app-private temporary WAV. Successful transcription, cancel, navigation, backgrounding and session changes discard temporary audio. Failed transcription retains it only for explicit retry. Native abandoned preview files are removed at the next recording attempt. Cleanup errors are surfaced and may require closing the app and clearing local app data. The privacy notice explains these boundaries and provider operational retention.

Capture normalizes hardware input to16kHz mono16-bit PCM WAV, capped at120 seconds (3,840,044 bytes). The server verifies actual RIFF/chunk/data lengths, PCM encoding, channels/rate, byte rate/block alignment and duration, with a5MiB request cap. Provider response bodies are bounded to64KiB before JSON parsing. M4A/AAC/WebM signatures previously forwarded with unknown duration are now rejected. Both production recorder adapters produce validated WAV. Meta's existing transport/model is unchanged. One successful transcription reserves one existing AI action; provider failure releases it. Save/reopen does not call a model. Metrics exclude audio, transcript, filenames, note content and identity.

SDK58-compatible expo-audio supplies native PCM and expo-file-system supplies temporary playback. App config explains microphone permission and disables background recording/playback. Web delivery permits only same-origin microphone access and local blob audio playback; camera/geolocation retain their prior denial.

## Reproducible verification

Starting development6c13ab19e5eb037fb53c9199afd94d3f6870b004:842 workspace tests/type/lint passed. Final source:865 tests (API520/mobile300/web23/contracts22), typecheck/lint; site18 checks. No tests skipped/deleted or configurations weakened. Existing compressed-format regression tests now assert refusal instead of accepting signature-only fixtures.

```sh
npm ci --ignore-scripts
npm run check
node apps/site/scripts/check.mjs
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=https://api-dev.mergemate.dev npm run export:web -w @mergemate/mobile
node apps/mobile/scripts/check-voice-notes.mjs
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=https://api-dev.mergemate.dev npm exec -w @mergemate/mobile -- expo export --platform ios --platform android --no-bytecode --output-dir /private/tmp/j006-final-native-js
npm run security:bundles
```

The browser script starts a temporary loopback fixture server and closes it afterward. Eight scenarios combine393px/1440px with enabled/off/no-consent/denied states. Real Chrome Web Audio processing uses an oscillator-backed microphone fixture; GitHub/API/provider/storage responses are mocked, not production substitutions. Direct getUserMedia synthetic-device attempts stalled on this host; its system microphone permissions were not changed. Physical microphone acceptance remains unverified.

Fixture smoke: open the PR and Add Note; record/pause/resume/stop/play; transcribe through one simulated failure; edit and explicitly save through one simulated failure; reload/reopen. Expect one edited note, no automatic save, text retained after failure, and stopped microphone tracks on cancel/background. Repeat in Highlight; PR/Highlight scopes remain separate. Off/no-consent/denied states make zero transcription requests. Unit fixtures additionally cover native permission cancellation, partial-file cleanup, hardware normalization, duration caps, credentials/cancellation and backend ownership/idempotency/CSRF/repository revocation/account cascade. Screenshots are in /private/tmp/mergemate-voice-notes/; committed script reproduces them.

APIdev, webdev and site packaging dry runs passed. security:bundles found no reported vulnerable package instances in inspected API/web/iOS/Android bundle inputs; the existing tooling audit remains3 high/5 low. npm audit is not clean. Changed-commit secret scan0; whole-source scan retains2 unchanged published RFC8291 vectors at apps/api/test/web-push.test.ts:12,14. Proof logs use /private/tmp/j006-*.log.

## Actual Android compile

Local Android-only Expo prebuild and full arm64 debug compilation passed: **344 tasks executed, BUILD SUCCESSFUL**. In generated apps/mobile/android:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=$ANDROID_HOME ./gradlew :app:assembleDebug --max-workers 2 -PreactNativeArchitectures=arm64-v8a
```

APK apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk (82,050,071 bytes) contains expo/modules/audio/AudioModule, expo/modules/audio/AudioStream and the existing dev/mergemate/offlinevoice/OfflineVoiceModule classes. Generated native/build files are ignored; committed dependencies/config reproduce them. Prebuild's package script rewrites were restored. Log:/private/tmp/j006-android-build.log. No installation, upload or signed-release claim. iOS JS export is not an iOS compile.

## Review and release

One development PR; independent exact-SHA review, the owner merges. Implementation checks are not an independent PASS. Migration0014 remains source-only. Before activation the owner must release the API migration and compatible native app, perform physical iOS/Android/browser permission/interruption/playback acceptance, and approve live provider validation. No implementation is intentionally deferred behind the switch. No live provider call, cloud mutation, remote migration, deployment, secret access or flag activation was performed.

Primary references checked against installed SDK58 types/source: [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/), [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/).
