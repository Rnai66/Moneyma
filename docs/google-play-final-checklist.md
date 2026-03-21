# Google Play Final Submission Checklist for MoneyMa

Repository:

- `https://github.com/Rnai66/Moneyma`

Privacy Policy URL:

- `https://rnai66.github.io/Moneyma/privacy-policy.html`

## 1. GitHub Pages

- Push code to `main`
- Open `Settings > Pages`
- Set `Source` to `GitHub Actions`
- Wait for `Deploy GitHub Pages` workflow to succeed
- Open:
  `https://rnai66.github.io/Moneyma/privacy-policy.html`
- Confirm the page loads publicly without login

## 2. Privacy Policy

- Confirm contact email is:
  `rnaibro@gmail.com`
- Confirm policy content matches the production app build
- If you choose exact providers later, update policy to name them
  Example:
  `Firebase Authentication`, `Cloud Firestore`, `Firebase Crashlytics`

## 3. Data Safety in Play Console

- Top-level:
  - `Does your app collect or share user data?` -> `Yes`
  - `Encrypted in transit?` -> `Yes`
  - `Deletion request available?` -> `Yes`

- Declare at minimum:
  - `Email address`
  - `User IDs`
  - `Other financial info`
  - `Crash logs`
  - `Diagnostics`
  - `Device or other IDs` if used by your auth/crash stack

- Reference file:
  [google-play-data-safety-checklist.md](/Users/rnaibro/PFM/docs/google-play-data-safety-checklist.md)

## 4. Android Release Artifact

- Confirm release AAB exists:
  [app-release.aab](/Users/rnaibro/PFM/android/app/build/outputs/bundle/release/app-release.aab)
- Confirm signing is correct for your release pipeline and Play App Signing setup
- Confirm package name is the intended production package
- Confirm version is `1.3.0`

## 5. Store Listing

- App name: `MoneyMa`
- Short description
- Full description
- App icon
- Feature graphic
- Phone screenshots
- Tablet screenshots if required for target devices
- Category and tags
- Support email:
  `rnaibro@gmail.com`

## 6. Policy and Access Forms

- Data safety
- App content
- Content rating
- Target audience
- Ads declaration
  If no ads SDK is included, answer accordingly
- App access
  If login is required for review, provide demo credentials or clear review instructions

## 7. Functional Review Before Submission

- Login works
- Account creation works
- Cloud backup works
- Sync works across devices
- Crash reporting is initialized correctly
- Account deletion path works
- Data deletion request path is documented
- Privacy Policy URL is live

## 8. Nice-to-Have Before Production

- Add named provider references to privacy policy
- Add in-app link to privacy policy
- Add in-app account deletion/help screen
- Add a release notes draft for version `1.3.0`
