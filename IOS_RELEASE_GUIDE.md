# iOS Release Guide

## Current Status

- `Release + iphoneos` compile passes.
- Signed Release build passes on this machine.
- `Archive` passes on this machine.
- `Development export` passes on this machine.
- Bundle ID: `com.personalfinance.manager`
- Team ID: `H4X9654279`

## Signed Build

Build a signed Release app:

```bash
npm run build-ios-release
```

Output app:

```text
/tmp/pfm-ios-release-sign/Build/Products/Release-iphoneos/App.app
```

## Archive

Create an `.xcarchive` for distribution:

```bash
npm run archive-ios
```

Archive output:

```text
/tmp/pfm-ios-archives/MoneyMa.xcarchive
```

## Export IPA

Development IPA:

```bash
npm run export-ios-development
```

Output:

```text
/tmp/pfm-ios-exports/development
```

App Store / TestFlight IPA:

```bash
npm run export-ios-appstore
```

Output:

```text
/tmp/pfm-ios-exports/app-store
```

Current expected blocker for App Store / TestFlight export on this machine:

- No distribution signing certificate installed.
- No distribution provisioning profile for `com.personalfinance.manager`.
- No App Store Connect provider/account context available to Xcode on this machine.

## Device Install

The current signed app can be installed with:

```bash
xcrun devicectl device install app --device <DEVICE_ID> /tmp/pfm-ios-release-sign/Build/Products/Release-iphoneos/App.app
```

Current blocker on this iPhone:

- Free Apple developer provisioning allows only 3 installed apps signed with a free profile on the device.
- The device is already at that limit.

## TestFlight / App Store Checklist

- Use an Apple Developer Program account, not only a free Apple ID.
- Ensure an `Apple Distribution` certificate exists in Keychain.
- Ensure a distribution provisioning profile exists for `com.personalfinance.manager`.
- Sign into Xcode with the App Store Connect account that owns the app/provider.
- Ensure App Store Connect app record exists for `com.personalfinance.manager`.
- Confirm version/build number are incremented before each upload.
- Verify app icons, launch screen, and privacy answers are final.
- Verify Firebase/production environment values are the release values.
- Archive with `npm run archive-ios`.
- Export with `npm run export-ios-appstore` or upload the archive directly from Xcode Organizer.
- Upload dSYM files if a crash-reporting workflow requires them.
- Complete App Privacy, age rating, screenshots, and release metadata in App Store Connect.

## Notes

- The remaining build warning about AppIntents metadata is non-blocking.
- Automatic signing currently works for development signing on this machine.
- App Store/TestFlight export may still require switching from development signing assets to distribution signing assets.
