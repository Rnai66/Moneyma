# Firebase Setup & App Distribution Guide

## Prerequisites
- Firebase CLI installed: `npm install -g firebase-tools`
- Firebase Project created at https://console.firebase.google.com
- Google Services config files downloaded

## Step 1: Initialize Firebase
```bash
firebase login
cp .firebaserc.example .firebaserc
firebase init hosting
```

When prompted during `firebase init hosting`:
- Use `build` as the public directory
- Configure as a single-page app: `Yes`
- Do not overwrite `build/index.html`

## Step 2: Download Config Files
### Android
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Copy JSON and save as `google-services.json` in `android/app/`

### iOS  
1. Go to Firebase Console → Project Settings
2. Download `GoogleService-Info.plist`
3. Copy to `ios/App/App/`

## Step 3: Generate Signing Keys

### Android Keystore
```bash
# Generate keystore (run once only)
keytool -genkey -v -keystore ~/moneyma-key.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 -alias moneyma-key

# Copy to project
cp ~/moneyma-key.keystore android/app/

# Set environment variables
export KEYSTORE_PASSWORD="your_password"
export KEYSTORE_ALIAS="moneyma-key"
```

### iOS Signing
1. Open `ios/App/App.xcworkspace` in Xcode
2. Select "App" target
3. Go to Signing & Capabilities
4. Select development team and provisioning profile

## Step 4: Build Release APK/IPA

### Android Release
```bash
cd android
./gradlew bundleRelease
# OR
./gradlew assembleRelease
```

### iOS Release
```bash
cd ios/App
xcodebuild -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -derivedDataPath build \
  -arch arm64 \
  -sdk iphoneos \
  build
```

## Step 5: Distribute via Firebase App Distribution

### Android
```bash
firebase appdistribution:distribute android/app/build/outputs/apk/release/app-release.apk \
  --app 1:YOUR_PROJECT_NUMBER:android:YOUR_APP_ID \
  --tester-groups testers \
  --release-notes "Version 1.4.0 - Release Build"
```

### iOS
```bash
firebase appdistribution:distribute build/ios/ipa/App.ipa \
  --app 1:YOUR_PROJECT_NUMBER:ios:YOUR_APP_ID \
  --tester-groups testers \
  --release-notes "Version 1.4.0 - Release Build"
```

## Step 6: Manage Testers
```bash
# Add tester group
firebase appdistribution:testers:add testers@example.com --group testers

# List testers
firebase appdistribution:testers:list
```

## Build & Distribute Script

Add to `.env.local`:
```bash
REACT_APP_SITE_URL=https://your-domain.example.com
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_FIREBASE_API_KEY=your-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=1234567890
REACT_APP_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
REACT_APP_FIREBASE_MEASUREMENT_ID=
KEYSTORE_PASSWORD=your_keystore_password
KEYSTORE_ALIAS=moneyma-key
FIREBASE_PROJECT_ID=your-firebase-project-id
```

Run full build and distribution:
```bash
npm run build
npm run build-android-release
npm run distribute-android
```

## GitHub Actions Secrets

Add these repository secrets before running the checked-in workflows:

- `REACT_APP_SITE_URL`
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- `REACT_APP_FIREBASE_API_KEY`
- `REACT_APP_FIREBASE_AUTH_DOMAIN`
- `REACT_APP_FIREBASE_PROJECT_ID`
- `REACT_APP_FIREBASE_STORAGE_BUCKET`
- `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`
- `REACT_APP_FIREBASE_APP_ID`
- `REACT_APP_FIREBASE_MEASUREMENT_ID`
- `FIREBASE_TOKEN`
- `ANDROID_APP_ID`
- `IOS_APP_ID`
- `KEYSTORE_PASSWORD`

## Troubleshooting

### If APK build fails
```bash
cd android
./gradlew clean
./gradlew --refresh-dependencies
./gradlew assembleRelease
```

### If FirebaseCrashlytics fails
- Ensure `google-services.json` is in correct location
- Rebuild with `./gradlew clean` first

### If distribution fails
- Verify app ID matches Firebase project
- Check tester email is registered
- Ensure you have "Editor" role in Firebase project

## Next Steps
- Add to Google Play Store / Apple App Store
- Setup CI/CD pipeline with GitHub Actions
- Configure automatic crash reporting
- Enable analytics
