# MergeMate 0.2.0 mobile and PWA release pack

Owner-operated on the owner's Mac. This pack prepares source and commands; it does not build, sign, upload, submit, deploy or approve production. Production HOLD remains.

## Versions and profiles

`apps/mobile/app.json` keeps marketing version `0.2.0` and historical counter seeds (iOS1 / Android2). **These seeds are not the installed build identity.** `eas.json` now uses `cli.appVersionSource: "remote"`; both `ios-dev` and `android-dev` set `autoIncrement: true`. EAS allocates the next platform counter for each local EAS build. For example, a current counter24 gives25, then26 on the next invocation, even at the same source commit. Failed/cancelled allocations may leave gaps; never decrement, reset or reuse a number. The remote service coordinates machines; a local timestamp or uncommitted app.json edit is not the counter.

Owner-only prerequisite before the first MM-088 build: inspect the authorized project's platform counters (`cd ~/code/mergemate/apps/mobile && npx eas build:version:get --platform ios --profile ios-dev`, and the analogous Android command). If uninitialized, use `npx eas build:version:set --platform ios --profile ios-dev` / `--platform android --profile android-dev` interactively to seed at least the highest previously used value for that app identifier (known receipts: iOS1, Android2); include any higher external receipts. Initialize once, never lower an existing counter. Do not accept an initialization that reuses a shipped number. Build output must confirm the new allocation before retaining the artifact. EAS login/network access remains necessary even with `--local`. No counter was initialized or allocated by Codex. Production profiles inherit remote version sourcing too; production is on HOLD and its counter/identifier must be reconciled by the owner before any future authorized cut.

Settings → **About MergeMate** shows `Version`, `Build number`, and the full `Source commit`. Version/build come from `expo-application` reading the installed binary, not app.json, filenames, telemetry run IDs or API state. Commit is embedded in Expo config from `EAS_BUILD_GIT_COMMIT_HASH` (with Git HEAD fallback during config evaluation). A missing value says Unavailable; web says Not a native build. A fresh owner native build is required to add this native dependency/UI; this does not retrofit the installed0559750 binaries or enable OTA updates.

The native wrapper rejects dirty/untracked source and exports full HEAD so the source receipt identifies the actual checkout. EAS post-install and success hooks print `MergeMate native receipt: platform=… version=… build=… commit=…`; build numbers are read from the generated native project after prebuild, not stale local seeds. Receipt extraction fails if the generated identity cannot be determined. Retain the successful receipt plus the EAS artifact path/checksum; a printed pre-build receipt alone is not installation or build-success evidence.

`ios-dev` is an internally distributed signed device build (.ipa), not an App Store submission. `android-dev` builds an internal APK. Both target api-dev.mergemate.dev. These builds contain expo-network and expo-clipboard; older native clients cannot validate the new native functionality.

## Local prerequisites

- Fetch the merged development commit and record its SHA. Keep the working tree clean.
- Use the repository's supported Node version and run `npm ci` at the monorepo root.
- Install Expo's EAS CLI (`npm install --global eas-cli`) and confirm `npx eas --version` identifies eas-cli. Authenticate to the authorized Expo account locally.
- Confirm the EAS project association belongs to Ploonu. The repository contains an EAS project association; confirm it against the authorized account. Never replace it with an invented project ID.
- iOS: supported Xcode and command-line tools, CocoaPods/Fastlane requirements for local EAS builds, Apple team and signing credentials, registered device UDIDs for internal distribution. Confirm the dev.mergemate.dev association file and device entitlements.
- Android: compatible JDK, Android SDK/NDK and local build tooling for the installed Expo SDK; authorized signing credentials. Record the APK signing fingerprint for App Links. No emulator is required.
- Reach the Access-gated dev API through approved device/browser access. Never embed Cloudflare service credentials in EXPO_PUBLIC variables or a shipped app.
- Check API/migration compatibility first. MM085 API0017 and site0002 were source-only at engineering handoff; verify actual deployment/migration receipts with the operator. This pack neither applies migrations nor overrides their approval process.

## Exact owner local build commands (with automated logging & build-host mesh sync)

After fetching the desired development commit and installing dependencies, run the unified build runner from monorepo root (or `apps/mobile`). It automatically captures all terminal output to a local log file, syncs the log to `build-host:~/build-mirror/build_logs/`, and records the build run into `build-host:~/build-mirror/builds.db` (`build_runs` table) so all agents across the mesh can inspect it:

```bash
cd ~/code/mergemate && ./scripts/build-and-log.sh ios
```

```bash
cd ~/code/mergemate && ./scripts/build-and-log.sh android
```

Or for web (PWA export) and API checks:
```bash
cd ~/code/mergemate && ./scripts/build-and-log.sh web
cd ~/code/mergemate && ./scripts/build-and-log.sh api
```

Use the wrapper for owner releases so the clean-source guard and commit receipt apply. Direct dev-profile EAS builds still use remote counters and receipt hooks, but do not bypass the clean-source requirement.

### Where logs are accessible to agents:
- **Local Machine**: `logs/build-ios.log`, `logs/build-android.log`, `logs/build-web.log`, `logs/build-api.log`
- **build host Mesh**: `ssh build-host 'cat ~/build-mirror/build_logs/mergemate-ios-latest.log'` (or `mergemate-android-latest.log`)
- **build host DB**: Recorded in `build_runs` table in `~/build-mirror/builds.db` on `build-host` (accessible via `GET https://build-host:8443/api/builds` or python)

Retain the build log, exact source SHA, artifact location, checksum and version/build values. Install the IPA through the team's authorized internal-device workflow and the APK on a physical Android device. Do not run eas submit, an App Store/TestFlight upload, or a production profile as part of these commands.

## Device acceptance

Verify sign-in/callback links, PR navigation, the compact header and44pt controls, read-only confirmed GitHub handoff, share/note actions, native speech lifecycle, push permission/rotation/tap/logout and native offline/reconnect isolation. Check voice-unavailable behavior and screen-reader names. Record OS/device, source SHA, observed behavior and failures. Browser fixtures are not device acceptance.

## Exact polished PWA release line

After prerequisites and the normal dev release checks:

```bash
the release script mergemate dev web --dry-run && the release script mergemate dev web
```

Verify dev web health, current deployed SHA, signed-in393px/desktop PR review and an installed PWA after the release. Record actual receipts. This command releases dev web only; it does not migrate databases or release API/site/production. Live Meta inference, physical devices and final hackathon submission remain separate acceptance gates.
