# Google Login Setup Guide for MoneyMa

To enable Google Login in your application, you need to configure both the Google Cloud Console and the Supabase Dashboard.

## Part 1: Google Cloud Console Configuration

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project or select an existing one.
3.  Navigate to **APIs & Services > OAuth consent screen**.
    -   Choose **External** user type.
    -   Fill in the required app information (App name, support email, developer contact).
    -   Add the scope `.../auth/userinfo.email` and `.../auth/userinfo.profile`.
4.  Navigate to **APIs & Services > Credentials**.
5.  Click **Create Credentials > OAuth client ID**.
    -   Select **Web application** as the application type.
    -   **Name**: MoneyMa Web / Supabase.
    -   **Authorized JavaScript origins**:
        -   `http://localhost:3000` (for local development)
        -   `https://your-domain.netlify.app` (your production URL)
    -   **Authorized redirect URIs**:
        -   Add the Supabase Auth Callback URL: `https://[YOUR_PROJECT_ID].supabase.co/auth/v1/callback`
        -   (You will find this in the Supabase Dashboard in the next part).
6.  Copy your **Client ID** and **Client Secret**.

---

## Part 2: Supabase Dashboard Configuration

1.  Go to your [Supabase Project Dashboard](https://supabase.com/dashboard).
2.  Navigate to **Authentication > Providers**.
3.  Find **Google** in the list and enable it.
4.  Paste your **Client ID** and **Client Secret** from the Google Cloud Console.
5.  **Redirect URL**: Ensure the "Allow Wildcards" is set correctly if you have multiple preview environments.
6.  Click **Save**.

---

## Part 3: Capacitor / Mobile Deep Links (Important)

For Google Login to work on mobile, the app needs to know how to handle the redirect from the system browser back to the app.

1.  In your Supabase Dashboard, go to **Authentication > URL Configuration**.
2.  Add `moneyma://auth` to the **Redirect URLs** list.
3.  In your `src/services/SupabaseService.js`, ensure the `getAuthRedirectBaseUrl` function returns `moneyma://auth` when running on a native platform (this is already implemented).

### Android Setup:
Ensure your `android/app/src/main/AndroidManifest.xml` has an intent filter for the scheme `moneyma`:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="moneyma" android:host="auth" />
</intent-filter>
```

### iOS Setup:
Ensure your `ios/App/App/Info.plist` has the URL scheme registered:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.moneyma.app</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>moneyma</string>
    </array>
  </dict>
</array>
```

---

## Part 4: Testing

1.  **Web**: Run `npm start` and click "Sign in with Google". It should redirect you to the Google login page and then back to your app.
2.  **Mobile**: Run `npx cap open android` or `npx cap open ios`. Build the app and test the login flow.

> [!TIP]
> If you encounter a "Redirect URI mismatch" error, double-check that the URL in the Google Cloud Console matches exactly with the one shown in the error message (usually your Supabase callback URL).
