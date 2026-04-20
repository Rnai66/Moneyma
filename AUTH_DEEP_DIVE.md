# Phase 1 Authentication - Deep Dive Explanation

## 🎯 Architecture Overview

The authentication system uses a **Context-based architecture** with three layers:

```
┌─────────────────────────────────────────────────┐
│     React Components (Login, Register, App)     │
│                   ↑    ↓                        │
│     useAuth() Hook  + AuthProvider              │
│                   ↓    ↑                        │
│     AuthContext (Global State)                  │
│                   ↓    ↑                        │
│     SupabaseService (API Calls)                 │
│                   ↓    ↑                        │
│     Supabase (Backend)                          │
└─────────────────────────────────────────────────┘
```

---

## 🔐 Layer 1: SupabaseService (`src/services/SupabaseService.js`)

### Purpose
Handles all direct communication with Supabase. It's a **singleton pattern** - only one instance exists in the entire app.

### Key Methods

#### 1. `signUp(email, password, metadata)`
**What it does:**
- Creates new user account in Supabase
- Sends verification email (optional)
- Returns user object with ID

**Example:**
```javascript
const { user, session, error } = await SupabaseService.signUp(
  'user@example.com',
  'password123',
  { firstName: 'John', lastName: 'Doe' }
);
```

**Behind the scenes:**
```
1. Validate email format
2. Hash password with bcrypt
3. Store in auth.users table
4. Store metadata in user_profiles table
5. Create JWT token
6. Return user data
```

#### 2. `signIn(email, password)`
**What it does:**
- Authenticates user with email/password
- Returns session token (JWT)
- Sets user context

**Example:**
```javascript
const { user, session, error } = await SupabaseService.signIn(
  'user@example.com',
  'password123'
);
```

**Behind the scenes:**
```
1. Look up user by email
2. Hash provided password
3. Compare with stored hash
4. If match: Create JWT token
5. If no match: Return "Invalid credentials"
6. Return session with token
```

#### 3. `getSession()`
**What it does:**
- Gets current session from localStorage
- Used to restore session on page refresh

**Behind the scenes:**
```
localStorage contains:
{
  access_token: 'eyJ...',
  refresh_token: 'eyJ...',
  expires_in: 3600,
  user: { id: 'uuid', email: '...', ... }
}
```

#### 4. `signOut()`
**What it does:**
- Clears session
- Removes tokens from localStorage
- Clears auth context

---

## 🌳 Layer 2: AuthContext (`src/services/AuthContext.js`)

### Purpose
Manages authentication state globally using React Context API.

### How it Works

**1. Provider Setup**
```javascript
<AuthProvider>
  <App />
</AuthProvider>
```

This wraps entire app and provides auth state to all components.

**2. Context Value**
```javascript
const value = {
  user,              // Currently logged-in user { id, email, user_metadata }
  session,           // JWT session token
  loading,           // true while checking session
  error,             // Error object if auth failed
  isAuthenticated,   // Boolean: is user logged in?
  signUp,            // Function to register
  signIn,            // Function to log in
  signOut,           // Function to log out
  resetPassword,     // Function to reset password
  updatePassword,    // Function to update password
};
```

**3. State Initialization**
```javascript
useEffect(() => {
  // On mount: Check if user already has session
  const checkSession = async () => {
    const { session } = await SupabaseService.getSession();
    if (session?.user) {
      setUser(session.user);
      setSession(session);
    }
  };
  checkSession();
}, []);
```

This ensures users stay logged in after page refresh.

**4. Auth State Subscription**
```javascript
useEffect(() => {
  // Listen for auth changes in real-time
  const { data } = SupabaseService.getClient()
    .auth.onAuthStateChange((event, currentSession) => {
      if (currentSession?.user) {
        setUser(currentSession.user);
        setSession(currentSession);
      } else {
        setUser(null);
        setSession(null);
      }
    });
  
  return () => data?.unsubscribe();
}, []);
```

Supabase automatically notifies when auth state changes (sign up, sign in, sign out).

### useAuth() Hook

```javascript
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

**Usage in components:**
```javascript
function MyComponent() {
  const { user, isAuthenticated, signOut } = useAuth();
  
  if (!isAuthenticated) {
    return <p>Not logged in</p>;
  }
  
  return <p>Welcome {user.email}</p>;
}
```

---

## 🖥️ Layer 3: UI Components

### Login Page (`src/pages/Login.js`)

**Flow:**
```
User enters email/password
          ↓
Form validation
          ↓
Click "Sign In"
          ↓
Call signIn(email, password)
          ↓
AuthContext updates
          ↓
App detects isAuthenticated = true
          ↓
Show main app (not login page)
```

**Code flow:**
```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  
  // Client-side validation
  if (!email || !password) {
    setError('Email and password required');
    return;
  }
  
  try {
    // Call auth context
    const { error: signInError } = await signIn(email, password);
    
    if (signInError) {
      // Show error to user
      setError(signInError.message);
    } else {
      // Success - clear form
      setEmail('');
      setPassword('');
      // onLoginSuccess callback called
    }
  } catch (err) {
    setError(err.message);
  }
};
```

### Register Page (`src/pages/Register.js`)

**Similar flow as Login:**
```
User enters name, email, password
          ↓
Form validation (email format, password length)
          ↓
Click "Create Account"
          ↓
Call signUp(email, password, { firstName, lastName })
          ↓
AuthContext updates
          ↓
Switch to login or auto-login
```

### App Routing (`src/App.js`)

**The AppWrapper component:**
```javascript
function AppWrapper() {
  const { isAuthenticated, loading } = useAuth();
  const [authMode, setAuthMode] = useState('login');

  // Show loading while checking session
  if (loading) {
    return <LoadingScreen />;
  }

  // Not authenticated: Show auth pages
  if (!isAuthenticated) {
    if (authMode === 'login') {
      return <Login onSwitchToRegister={...} onLoginSuccess={...} />;
    } else {
      return <Register onSwitchToLogin={...} onRegisterSuccess={...} />;
    }
  }

  // Authenticated: Show main app
  return <MainApp />;
}
```

---

## 🔑 Data Flow Example: User Sign Up

Let's trace what happens when user signs up:

**Step 1: User Action**
```javascript
// User fills form and clicks "Sign Up"
const { error } = await signUp(
  'john@example.com',
  'password123',
  { firstName: 'John', lastName: 'Doe' }
);
```

**Step 2: AuthContext**
```javascript
const signUp = async (email, password, metadata = {}) => {
  try {
    setError(null);
    // Call SupabaseService
    const { user: newUser, session, error } = 
      await SupabaseService.signUp(email, password, metadata);
    
    if (error) throw error;
    
    // Update context state
    setUser(newUser);
    setSession(session);
    return { user: newUser, error: null };
  } catch (err) {
    setError(err);
    return { user: null, error: err };
  }
};
```

**Step 3: SupabaseService**
```javascript
async signUp(email, password, metadata = {}) {
  const { data, error } = await this.client.auth.signUp({
    email,
    password,
    options: {
      data: metadata,  // firstName, lastName
    },
  });
  
  if (error) throw error;
  
  return { user: data.user, session: data.session, error: null };
}
```

**Step 4: Supabase Backend**
```
REST API Call: POST /auth/v1/signup
{
  email: 'john@example.com',
  password: 'password123',
  data: { firstName: 'John', lastName: 'Doe' }
}

Backend Process:
1. Hash password with bcrypt
2. Create record in auth.users table
3. Store metadata
4. Generate JWT tokens
5. Return user + session

Response:
{
  user: {
    id: 'uuid-123',
    email: 'john@example.com',
    user_metadata: { firstName: 'John', lastName: 'Doe' }
  },
  session: {
    access_token: 'eyJ...',
    refresh_token: 'eyJ...',
    expires_in: 3600 (1 hour)
  }
}
```

**Step 5: Client Storage**
```javascript
// Supabase SDK automatically stores in localStorage:
localStorage.setItem('sb-auth-token', JSON.stringify({
  access_token: 'eyJ...',
  refresh_token: 'eyJ...',
  user: { id: '...', email: '...', ... }
}));
```

**Step 6: Component Update**
```javascript
// AppWrapper detects change
function AppWrapper() {
  const { isAuthenticated } = useAuth();
  
  // isAuthenticated is now TRUE
  // Component re-renders showing MainApp instead of Login
  return isAuthenticated ? <MainApp /> : <Login />;
}
```

---

## 🔄 Session Management

### Storing Session
When user logs in, Supabase SDK saves to `localStorage`:
```javascript
{
  "sb-nvgqqhqoarkfulsebepj-auth-token": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "expires_in": 3600,
    "expires_at": 1234567890,
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "00000000-0000-0000-0000-000000000000",
      "email": "user@example.com",
      "user_metadata": { "firstName": "John", "lastName": "Doe" },
      ...
    }
  }
}
```

### Restoring Session (Page Refresh)
```
User refreshes page
         ↓
App mounts: AuthProvider checks session
         ↓
AuthContext.useEffect() runs getSession()
         ↓
Supabase SDK reads localStorage
         ↓
Session found: Set user + session state
         ↓
isAuthenticated = true
         ↓
Show MainApp (not login page)
```

### Token Refresh
When token expires (1 hour by default):
```
API call returns 401 (Unauthorized)
         ↓
Supabase SDK detects expired token
         ↓
Uses refresh_token to get new access_token
         ↓
Updates localStorage
         ↓
Retry original request
         ↓
Success!
```

---

## 🛡️ Security Features

### 1. Password Hashing
```
User enters: "password123"
         ↓
Sent to Supabase over HTTPS
         ↓
Supabase hashes using bcrypt
         ↓
Hash stored (never plain text)
         ↓
Stored in database:
$2a$10$xyz...abc (bcrypt hash)
```

### 2. JWT Tokens
```
JWT format: header.payload.signature

ACCESS TOKEN (1 hour expiry):
{
  iss: "supabase",
  ref: "nvgqqhqoarkfulsebepj",
  role: "authenticated",
  aud: "authenticated",
  iat: 1234567890,
  exp: 1234571490
}

REFRESH TOKEN (longer expiry):
Used to get new access token silently
```

### 3. RLS (Row Level Security)
```javascript
-- Only user can access own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

-- If user tries to access another user's data:
-- SELECT * FROM user_profiles WHERE id = 'other-user-id'
-- Returns: Empty result (not error, for privacy)
```

### 4. HTTPS/TLS
All communication encrypted in transit:
```
http://localhost:3000 (development - no encryption)
https://app.example.com (production - encrypted)
```

### 5. CORS (Cross-Origin)
```
Browser sends Origin header
         ↓
Supabase checks if allowed
         ↓
If yes: Allow request
If no: Block request
```

---

## 🧪 Testing the Auth Flow

### Test 1: Sign Up with Invalid Email
```javascript
await signUp('invalid-email', 'password123');
// Returns: error: "Invalid email format"
```

### Test 2: Sign Up with Short Password
```javascript
await signUp('user@email.com', 'pass');
// Returns: error: "Password should be at least 6 characters"
```

### Test 3: Sign In with Wrong Password
```javascript
await signIn('user@email.com', 'wrongpassword');
// Returns: error: "Invalid login credentials"
// Note: Doesn't say "user doesn't exist" (privacy)
```

### Test 4: Session Persistence
```
1. Sign in
2. Refresh page (Cmd+R)
3. Still logged in (session restored from localStorage)
4. Check browser DevTools > Application > LocalStorage
   See: sb-*-auth-token with your session
```

### Test 5: Token Expiration
```
1. Sign in
2. Wait 1 hour (or modify token expiry in Supabase settings)
3. Make API call (e.g., fetch transactions)
4. Behind scenes: Auto-refresh token
5. Request succeeds (transparent to user)
```

---

## 🔗 Integration Points

### In Components
```javascript
import { useAuth } from '../services/AuthContext';

function ProfilePage() {
  const { user, signOut } = useAuth();
  
  return (
    <div>
      <p>Email: {user?.email}</p>
      <p>Name: {user?.user_metadata?.firstName}</p>
      <button onClick={signOut}>Logout</button>
    </div>
  );
}
```

### Protected Routes
```javascript
function PrivatePage() {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  
  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }
  
  return <div>Protected content</div>;
}
```

### API Calls with Auth
```javascript
const { user } = useAuth();

// Supabase automatically adds Authorization header:
// Authorization: Bearer eyJ...
const { data } = await supabase
  .from('transactions')
  .select('*')
  .eq('user_id', user.id);
```

---

## 🚀 Advanced Topics

### Password Reset Flow
```
1. User clicks "Forgot Password"
2. Enters email
3. signInWithOtp(email) OR resetPasswordForEmail(email)
4. Email sent with reset link/code
5. User clicks link
6. Redirected to reset password form
7. User submits new password
8. updateUser({ password: newPassword })
9. Session updated with new password
```

### Social Login (OAuth)
```javascript
// Not implemented yet, but similar flow:
const { user, session, error } = 
  await supabase.auth.signInWithOAuth({
    provider: 'github'
  });

// Redirects to GitHub login
// User approves
// Redirected back with auth code
// Code exchanged for session
```

### Two-Factor Authentication
```javascript
// After email/password auth:
const { user } = await signIn(email, password);

// If 2FA enabled:
// Send OTP to phone/authenticator
const { error } = await verifyOTP(user.id, otp);

// On success: Full authentication
```

---

## 📊 Auth State Diagram

```
                    ┌─────────────────┐
                    │   App Starts    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ AuthProvider    │
                    │  mounts         │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                            │
       ┌──────▼───────┐          ┌────────▼─────┐
       │ Has Session  │          │ No Session   │
       │ in Storage?  │          │              │
       └──────┬───────┘          └────────┬─────┘
              │ YES                        │ NO
       ┌──────▼───────┐          ┌────────▼─────┐
       │ Set User     │          │ Show Login   │
       │ State        │          │ Page         │
       └──────┬───────┘          └────────┬─────┘
              │                          │
              │                    ┌─────▼──────┐
              │                    │ User Signs │
              │                    │ In/Up      │
              │                    └──────┬─────┘
              │                           │
              └────────────┬──────────────┘
                           │
                    ┌──────▼──────┐
                    │ authorized  │
                    │ = true      │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Show MainApp│
                    └─────────────┘
```

---

## 🔐 Best Practices

✅ **DO:**
- Always use `useAuth()` hook in components
- Check `isAuthenticated` before accessing protected features
- Use RLS policies in database
- Never log sensitive auth tokens
- Listen for auth state changes

❌ **DON'T:**
- Store password in state/storage
- Put auth keys in public repos
- Use `const supabase = createClient()` in components
- Bypass RLS policies
- Share JWT tokens with users
- Log full user objects that contain tokens

---

## 📚 Key Concepts

| Concept | Explanation |
|---------|-------------|
| **JWT Token** | Signed object proving user is authenticated |
| **Access Token** | Short-lived (1 hour), used for API requests |
| **Refresh Token** | Long-lived, used to refresh access token |
| **RLS** | Database security - only you can see your data |
| **OAuth** | Login with Google/GitHub/etc (coming soon) |
| **PKCE** | OAuth security flow (for mobile apps) |
| **Password Hashing** | bcrypt - one-way encryption |
| **Context API** | React state management (not Redux) |

---

## 🎓 Learning Resources

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [JWT.io Debugger](https://jwt.io) - Inspect JWT tokens
- [React Context Docs](https://react.dev/learn/passing-data-deeply-with-context)
- [Authentication Security](https://owasp.org/www-community/attacks/csrf)

---

## 🔗 Files Reference

| File | Purpose |
|------|---------|
| `src/services/SupabaseService.js` | Low-level Supabase API |
| `src/services/AuthContext.js` | React Context for auth state |
| `src/pages/Login.js` | Login UI |
| `src/pages/Register.js` | Registration UI |
| `src/App.js` | Routing based on auth state |

---

**Last Updated**: 21 March 2026  
**Author**: GitHub Copilot  
**Level**: Intermediate - Advanced
