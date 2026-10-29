# Private Highlight analysis — J-007

Highlight remains optional and defaults off. The existing three-flag allowlist is unchanged; no live flag was activated. Signed-in, non-demo users need current AI consent. They select/capture a screenshot, optionally add a500-character note, and explicitly analyze it. Replacing/removing the image, changing the note, leaving/backgrounding the screen or changing accounts invalidates old results and cancels the client upload. The same Meta Muse Responses transport/model route remains in use; no segmentation/SAM endpoint was invented.

## Image and privacy boundaries

The server bounds requests at5MiB and checks the File size before reading it. JPEG, PNG and WebP signatures alone are insufficient: header/container boundaries, PNG CRC/chunks, JPEG markers/end, WebP frame/canvas consistency, still-image status,8192px sides and16Mi-pixel area are checked before the mandatory Images decoder. Appended polyglot data, SVG, animation, truncation and invalid dimensions fail closed. Header checks are not represented as full decoding: the configured Cloudflare IMAGES binding must also confirm type/dimensions and decode/re-encode; missing/failed preprocessing never forwards original bytes.

The binding resizes to at most2048×2048 and re-encodes to a still PNG. Output bytes are bounded to5MiB and validated again, then ancillary metadata is stripped independently (only IHDR/palette/transparency/pixels/IEND survive). Color profiles/orientation are applied by the transform before metadata removal; decoder-reported orientation swaps are accepted. The provider receives this normalized PNG, not the original filename, metadata or bytes. Vision response JSON is bounded to256KiB, explanations8000 characters, regions20, labels120 characters and boxes0–1000 with positive area.

**New analysis requests never write screenshots to R2, D1, KV, hosted Images or application cache.** The old R2 round trip was unused: model input already came from memory. Removing it removes storage/delete failure paths rather than promising deletion during an outage. Legacy bucket configuration and user-scoped account-deletion purge remain for old objects; the existing one-day lifecycle is the legacy backstop. No bucket/config/lifecycle mutation was performed.

Native image-picker copies are removed only inside the app's ImagePicker cache directory. Library originals, other folders and traversal aliases are protected by canonical URL checks. Web object URLs are revoked. Device cache cleanup on unmount is best effort; OS cache eviction is the backstop if local deletion fails or the process dies. This is disclosed separately from the stronger no-server-storage guarantee. No screenshot, reviewer note or identity is emitted in AI metrics. Provider requests retain existing store:false and gateway no-log/no-cache controls; provider operational retention remains subject to provider policy.

Suggestions are not verified segmentation or measured WCAG findings. Model boxes are shown as numbered approximate areas aligned to a bounded aspect-ratio preview; empty regions produce an explicit explanation, never fabricated boxes. Text is rendered literally, with no HTML/Markdown execution. No GitHub mutation controls are introduced.

## Verification and smoke

Fresh development6c13ab19e5eb037fb53c9199afd94d3f6870b004 baseline842 tests/type/lint passed on repeat. The first baseline attempt hit the unchanged localhost real-Durable-Object fixture ECONNRESET; no tests/configurations were disabled. Final workspace check859 tests (API524/mobile290/web23/contracts22), typecheck/lint pass; site18 checks pass. Existing storage tests now assert zero new R2 writes across success/failure, and still verify legacy account purge.

```sh
npm ci --ignore-scripts
npm run check
node apps/site/scripts/check.mjs
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=https://api-dev.mergemate.dev npm run export:web -w @mergemate/mobile
node apps/mobile/scripts/check-highlight.mjs
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=https://api-dev.mergemate.dev npm exec -w @mergemate/mobile -- expo export --platform ios --platform android --no-bytecode --output-dir /private/tmp/j007-native-js
npm run security:bundles
```

The browser script starts and closes a temporary loopback server. Eight scenarios combine393px/1440px with on/off/consent-off/demo. With the real browser file chooser, pick the fixture PNG, analyze through one simulated failure, retry, inspect numbered estimated boxes and literal script-like text, hold a request and replace its image, then verify the stale result never renders. Analyze the replacement with no regions, remove it, then verify background cleanup. Disabled access states make zero analysis calls. Screenshots:/private/tmp/mergemate-highlight (empty/gated/error/result/no-regions); browser command is committed for reproduction. API/model replies are mocked. Header, normalization-output and quota fixtures execute real application code; the Cloudflare decoder itself is a typed fixture, not a claim of live image transformation.

Real JPEG/WebP fixtures contain a harmless EXIF marker; the real PNG fixture and all three codecs were decoded offline while generating the test fixtures. Tests prove metadata does not survive the pipeline, malformed/polyglot/large inputs fail, decoder failure invokes no model, quota blocks before transformation, invalid boxes fail, metrics exclude private markers, local files remain scoped, and native/web cancellation uses React Native's supported abort-controller API. No tests were removed/skipped and no new unsafe type casts were added to pass checks.

APIdev/webdev/site packaging dry runs and web/iOS/Android JS exports pass. expo-file-system58.0.11 was already a transitive dependency in the starting lockfile; it is now declared directly for the cache cleanup API. No native module/version or platform permission changes were introduced, and no new native compilation claim is made. JS exports are not iOS/Android device acceptance.

Changed-commit secret scan0; whole-source scan retains the2 unchanged published RFC8291 vectors. Bundle evidence:/var/folders/c3/1jb_mhp16x38bhkxvf_blt040000gn/T/mergemate-security-DRD8wq. Reported affected package instances are absent from inspected API/web/iOS/Android bundles; tooling audit remains3 high/5 low. npm audit is not clean.

## Integration and release gates

Independent exact-SHA review, then the owner merges this single development PR. No migration is added. Do not include unmerged J005/J006 commits: preserve PR125 deletion changes and PR126 PrivateNotes/audio changes when integrating. In particular preserve both privacy disclosures, shared cancellation handling, J126 blob-media/microphone policy and J127 local-image CSP. Rebase and rerun combined checks if development changes; an old-SHA PASS does not authorize a new head.

Physical camera/gallery/cache behavior, deployed Images decoding/metadata/resize and approved live Muse acceptance remain release gates. No live model/image-provider call, flag activation, cloud mutation, remote migration, deployment, secret access, store/EAS/Xcode build/upload or main push was performed. The public waitlist stays unchanged; privacy source edits are not deployed.

Official API references verified against installed Workers types and docs: [Images bindings](https://developers.cloudflare.com/images/transform-images/bindings/), [image transform metadata rules](https://developers.cloudflare.com/images/transform-images/transform-via-url/#metadata). PNG output discards metadata according to these rules; the application additionally strips ancillary chunks.
