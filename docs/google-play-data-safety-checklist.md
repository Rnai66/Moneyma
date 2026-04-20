# Google Play Data Safety Checklist for MoneyMa

Last reviewed: March 21, 2026

This checklist is prepared for the planned release of MoneyMa with the following features enabled:

- Login and account system
- Cloud backup and synchronization
- Crash reporting

Use this document as a release checklist and as a drafting reference before completing the Google Play Data safety form.

Important:

- Review this before every release
- Final answers must match the exact production build and SDKs included in that build
- If you add analytics, ads, payments, social login profile fields, or additional tracking, this document must be updated again
- This draft assumes Supabase is used for authentication and cloud backup or synchronization

## 1. Current Intended App Behavior

MoneyMa is expected to:

- Allow users to create or use an account to sign in
- Store financial records under a user account
- Upload financial data to Supabase services for backup and synchronization
- Restore and synchronize financial data across devices
- Collect crash logs and diagnostics for app reliability and bug fixing
- Allow user-initiated export, backup, restore, and sharing of files

## 2. Recommended Top-Level Data Safety Answers

### Does your app collect or share any of the required user data types?

Recommended answer:

- Yes

Reasoning:

- The planned app behavior includes account data collection
- Financial data is uploaded for backup and synchronization
- Crash logs and diagnostics are collected

### Is all of the user data collected by your app encrypted in transit?

Recommended answer:

- Yes

Important:

- Only use this answer if all production services use secure transport such as HTTPS/TLS

### Do you provide a way for users to request that their data is deleted?

Recommended answer:

- Yes

You should provide:

- An in-app or support-based account deletion path
- A way to delete associated cloud data
- A privacy contact email or support channel

## 3. Recommended Declaration Matrix

Use the following as the baseline declaration set.

### Personal Info

- Name: No, unless profile names are collected
- Email address: Yes, collected
- User IDs: Yes, collected
- Address: No
- Phone number: No
- Race and ethnicity: No
- Political or religious beliefs: No
- Sexual orientation: No
- Other personal info: No, unless support or profile features collect more

### Financial Info

- User payment info: No, unless the app later processes cards, bank credentials, or billing profiles
- Purchase history: No
- Credit score: No
- Other financial info: Yes, collected

This category should cover:

- Income and expense records
- Transaction amounts
- Categories
- Budgets
- Dates
- Optional transaction notes if they are included in synced records

### Health and Fitness

- No

### Messages

- No

### Photos and Videos

- No

### Audio Files

- No

### Files and Docs

- No, unless user files are uploaded to your servers as files rather than structured record data

### Calendar

- No

### Contacts

- No

### App Activity

- No by default if you only use crash reporting
- Reassess if you add analytics events, usage tracking, or user interaction telemetry

### Web Browsing

- No

### App Info and Performance

- Crash logs: Yes, collected
- Diagnostics: Yes, collected
- Other app performance data: No, unless your crash or observability tooling explicitly collects it

### Device or Other IDs

- Likely Yes, collected if your crash reporting, authentication, or backend tooling uses installation IDs, instance IDs, or service-generated identifiers

Important:

- Review the exact SDK documentation for your chosen providers
- Confirm whether Supabase Auth, Supabase database or storage features, or your crash reporting provider generate service identifiers that must be declared
- Confirm whether your production auth, crash reporting, or sync providers generate installation IDs or other service identifiers

## 4. Recommended Purpose Selections by Data Type

Use these Play Console purposes as a baseline.

### Email address

- App functionality
- Account management

### User IDs

- App functionality
- Account management

### Other financial info

- App functionality

### Crash logs

- Analytics

### Diagnostics

- Analytics

### Device or other IDs

- App functionality
- Analytics

Choose only the purposes that truly apply to your implementation.

## 5. Recommended Answers Per Data Type

### Email address

- Collected or shared:
  `Collected`
- Is this data processed ephemerally:
  `No`
- Is collection required or optional:
  `Required` if sign-in is mandatory
  `Optional` if users can use the app without an account
- Purpose:
  `App functionality`, `Account management`

### User IDs

- Collected or shared:
  `Collected`
- Is this data processed ephemerally:
  `No`
- Is collection required or optional:
  `Required` if account-based sync is central to the app
- Purpose:
  `App functionality`, `Account management`

### Other financial info

- Collected or shared:
  `Collected`
- Is this data processed ephemerally:
  `No`
- Is collection required or optional:
  `Optional` if users can choose whether to enable cloud backup or sync
  `Required` if cloud storage is core to normal app usage
- Purpose:
  `App functionality`

### Crash logs

- Collected or shared:
  `Collected`
- Is this data processed ephemerally:
  `No`
- Is collection required or optional:
  `Required`
- Purpose:
  `Analytics`

### Diagnostics

- Collected or shared:
  `Collected`
- Is this data processed ephemerally:
  `No`
- Is collection required or optional:
  `Required`
- Purpose:
  `Analytics`

### Device or other IDs

- Collected or shared:
  `Collected` if used by crash or account infrastructure
- Is this data processed ephemerally:
  `No`
- Is collection required or optional:
  `Required`
- Purpose:
  `App functionality`, `Analytics`

## 6. Short Explanation Text for Play Console

Suggested short text:

`MoneyMa collects account information such as email address and user ID to support login and account management. Financial records may be uploaded to Supabase services to provide backup and synchronization across devices. Crash logs and diagnostics are collected to maintain app stability, troubleshoot errors, and improve reliability.`

## 7. Privacy Policy Alignment Checklist

Before submission, confirm that your public privacy policy includes:

- Account creation and login
- Email address and account identifier handling
- Cloud storage, backup, and synchronization
- Financial data categories processed by the service
- Crash logs and diagnostics collection
- Service-provider sharing language
- Data retention policy
- Account deletion and data deletion request process
- Support email or contact method

## 8. Release Checklist Before Play Submission

- Confirm which auth provider is used in production
- Confirm which cloud database or storage provider is used in production
- Confirm which crash reporting SDK is included in production
- If Supabase is used in production, confirm the exact Supabase products enabled for the release
- Confirm all network traffic for collected data uses HTTPS/TLS
- Confirm privacy policy URL is public and accessible without login
- Confirm account deletion and cloud data deletion flow exists
- Confirm Play Console answers exactly match included SDK behavior
- Confirm no ads or analytics SDKs were added unless declared

## 9. Current Risks to Resolve Before Submission

- A real support email must be added
- Public hosting for the privacy policy must be live
- Exact SDK-specific identifier behavior must be verified before submitting final answers
- If optional local-only mode remains available, the "optional vs required" declarations should be chosen carefully

## 10. Suggested Internal Release Note

`This release includes account-based login, cloud backup and sync, and crash reporting. Google Play Data safety answers must declare collection of email address, user IDs, financial info used for sync, and crash/diagnostic data, plus any identifiers required by the selected SDKs.`
