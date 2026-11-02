# MergeMate 0.2.0 mobile and PWA release pack

Owner-operated on the owner's Mac. This pack prepares source and commands; it does not build, sign, upload, submit, deploy or approve production. Production HOLD remains.

## Versions and profiles

`apps/mobile/app.json` uses version0.2.0, iOS buildNumber1 and Android versionCode2. `eas.json` uses local appVersionSource so these checked-in build numbers govern the local dev builds. Production profiles still increment versions; confirm unused numbers before any later store cut.

`ios-dev` is an internally distributed signed device build (.ipa), not an App Store submission. `android-dev` builds an internal APK. Both target api-dev.mergemate.dev. These builds contain expo-network and expo-clipboard; older native clients cannot validate the new native functionality.

## Local prerequisites

- Fetch the merged development commit and record its SHA. Keep the working tree clean.
- Use the repository's supported Node version and run `npm ci` at the monorepo root.
- Install Expo's EAS CLI (`npm install --global eas-cli`) and confirm `npx eas --version` identifies eas-cli. Authenticate to the authorized Expo account locally.
- Confirm the EAS project association belongs to Ploonu. The repository does not contain a configured EAS project UUID: an owner must link the authorized project before push tokens or EAS builds can work. Never invent a project ID.
- iOS: supported Xcode and command-line tools, CocoaPods/Fastlane requirements for local EAS builds, Apple team and signing credentials, registered device UDIDs for internal distribution. Confirm the dev.mergemate.dev association file and device entitlements.
- Android: compatible JDK, Android SDK/NDK and local build tooling for the installed Expo SDK; authorized signing credentials. Record the APK signing fingerprint for App Links. No emulator is required.
- Reach the Access-gated dev API through approved device/browser access. Never embed Cloudflare service credentials in EXPO_PUBLIC variables or a shipped app.
- Check API/migration compatibility first. MM085 API0017 and site0002 were source-only at engineering handoff; verify actual deployment/migration receipts with the operator. This pack neither applies migrations nor overrides their approval process.

## Exact owner local build commands

After fetching the desired development commit and installing dependencies:

```bash
cd ~/code/mergemate/apps/mobile && npx eas build --platform ios --local --profile ios-dev
```

```bash
cd ~/code/mergemate/apps/mobile && npx eas build --platform android --local --profile android-dev
```

Retain the build log, exact source SHA, artifact location, checksum and version/build values. Install the IPA through the team's authorized internal-device workflow and the APK on a physical Android device. Do not run eas submit, an App Store/TestFlight upload, or a production profile as part of these commands.

## Device acceptance

Verify sign-in/callback links, PR navigation, the compact header and44pt controls, read-only confirmed GitHub handoff, share/note actions, native speech lifecycle, push permission/rotation/tap/logout and native offline/reconnect isolation. Check voice-unavailable behavior and screen-reader names. Record OS/device, source SHA, observed behavior and failures. Browser fixtures are not device acceptance.

## Exact polished PWA release line

After prerequisites and the normal dev release checks:

```bash
the release script mergemate dev web --dry-run && the release script mergemate dev web
```

Verify dev web health, current deployed SHA, signed-in393px/desktop PR review and an installed PWA after the release. Record actual receipts. This command releases dev web only; it does not migrate databases or release API/site/production. Live Meta inference, physical devices and final hackathon submission remain separate acceptance gates.
