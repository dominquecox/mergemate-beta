# MergeMate 0.2.0 mobile and PWA release pack

Maintainer-operated on a configured build machine. This pack prepares source and commands; it does not build, sign, upload, submit, deploy or approve production. Production HOLD remains.

## Versions and profiles

`apps/mobile/app.json` keeps marketing version `0.2.0` and historical counter seeds (iOS1 / Android2). **These seeds are not the installed build identity.** `eas.json` now uses `cli.appVersionSource: "remote"`; both `ios-dev` and `android-dev` set `autoIncrement: true`. EAS allocates the next platform counter for each local EAS build. For example, a current counter24 gives25, then26 on the next invocation, even at the same source commit. Failed/cancelled allocations may leave gaps; never decrement, reset or reuse a number. The remote service coordinates machines; a local timestamp or uncommitted app.json edit is not the counter.

Owner-only prerequisite before the first MM-088 build: inspect the authorized project's platform counters (`cd ~/code/mergemate/apps/mobile && npx eas build:version:get --platform ios --profile ios-dev`, and the analogous Android command). If uninitialized, use `npx eas build:version:set --platform ios --profile ios-dev` / `--platform android --profile android-dev` interactively to seed at least the highest previously used value for that app identifier (known receipts: iOS1, Android2); include any higher external receipts. Initialize once, never lower an existing counter. Do not accept an initialization that reuses a shipped number. Build output must confirm the new allocation before retaining the artifact. EAS login/network access remains necessary even with `--local`. No counter was initialized or allocated by Codex. Production profiles inherit remote version sourcing too; production is on HOLD and its counter/identifier must be reconciled by the owner before any future authorized cut.

Settings → **About MergeMate** shows `Version`, `Build number`, and the full `Source commit`. Version/build come from `expo-application` reading the installed binary, not app.json, filenames, telemetry run IDs or API state. Commit is embedded in Expo config from `EAS_BUILD_GIT_COMMIT_HASH` (with Git HEAD fallback during config evaluation). A missing value says Unavailable; web says Not a native build. A fresh owner native build is required to add this native dependency/UI; this does not retrofit the installed0559750 binaries or enable OTA updates.

The native wrapper rejects dirty/untracked source and exports full HEAD so the source receipt identifies the actual checkout. The EAS success hook prints `MergeMate native receipt: platform=… version=… build=… commit=…`; build numbers are read from the generated native project after prebuild, not stale local seeds. Receipt extraction fails if the generated identity cannot be determined. Retain the successful receipt plus the EAS artifact path/checksum; this successful build receipt is not evidence of installation.

`ios-dev` is an internally distributed signed device build (.ipa), not an App Store submission. `android-dev` builds an internal APK. Both target api-dev.mergemate.dev. These builds contain expo-network and expo-clipboard; older native clients cannot validate the new native functionality.

## Local prerequisites

- Fetch the merged development commit and record its SHA. Keep the working tree clean.
- Use the repository's supported Node version and run `npm ci` at the monorepo root.
- Install Expo's EAS CLI (`npm install --global eas-cli`) and confirm `npx eas --version` identifies eas-cli. Authenticate to the authorized Expo account locally.
- This snapshot omits the original EAS project association. Link your own authorized Expo project and credentials before any native build or push registration; never invent a project ID.
- iOS: supported Xcode and command-line tools, CocoaPods/Fastlane requirements for local EAS builds, Apple team and signing credentials, registered device UDIDs for internal distribution. Confirm the dev.mergemate.dev association file and device entitlements.
- Android: compatible JDK, Android SDK/NDK and local build tooling for the installed Expo SDK; authorized signing credentials. Record the APK signing fingerprint for App Links. No emulator is required.
- Reach the Access-gated dev API through approved device/browser access. Never embed Cloudflare service credentials in EXPO_PUBLIC variables or a shipped app.
- Check API/migration compatibility first. Verify actual deployment/migration receipts with the operator; source files alone do not establish the live schema. This pack neither applies migrations nor overrides their approval process.

## Local build commands and logs

From the repository root, after dependencies, project association and signing are configured:

```bash
npm run build:ios
npm run build:android
```

The wrapper captures local output in `logs/build-<target>.log` and `apps/mobile/build-<target>.log`. `apps/mobile/scripts/build-with-log.sh` delegates to the same wrapper. A maintainer can set `MERGEMATE_BUILD_LOG_HOOK` to an absolute executable outside this checkout for a private log integration. Its arguments are target, status, commit, version, elapsed seconds and local log path. Hook failure does not change the build's exit code. No remote log destination is configured by this repository.

Direct local EAS commands remain available:

```bash
cd apps/mobile && npx eas build --platform ios --local --profile ios-dev
```

```bash
cd apps/mobile && npx eas build --platform android --local --profile android-dev
```

Retain the build log, exact source SHA, artifact location, checksum and version/build values. Install the IPA through the team's authorized internal-device workflow and the APK on a physical Android device. Do not run eas submit, an App Store/TestFlight upload, or a production profile as part of these commands.

## Device acceptance

Verify sign-in/callback links, PR navigation, the compact header and44pt controls, read-only confirmed GitHub handoff, share/note actions, native speech lifecycle, push permission/rotation/tap/logout and native offline/reconnect isolation. Check voice-unavailable behavior and screen-reader names. Record OS/device, source SHA, observed behavior and failures. Browser fixtures are not device acceptance.

## Web artifact and release acceptance

```bash
npm run export:web -w @mergemate/mobile
```

The export prepares an artifact only. Maintainers use their approved release process and record the deployed source SHA. Verify health, signed-in phone/desktop review and an installed PWA afterward. Production release, migrations, live inference, device acceptance and submission require their own authorization/evidence.
