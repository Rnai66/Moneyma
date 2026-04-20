# Phase 1: Login / Account System - Setup Guide

## ✅ What Has Been Implemented

### 1. **Supabase Service** (`src/services/SupabaseService.js`)
- Handles all authentication operations
- Methods for sign up, sign in, sign out
- User session management
- Password reset functionality
- Database operations (prepared for cloud sync)
- Error logging capability

### 2. **Auth Context** (`src/services/AuthContext.js`)
- Global authentication state management
-React hook `useAuth()` for accessing auth state
- Automatic session persistence
- Global error handling
- User session subscription

### 3. **Login Page** (`src/pages/Login.js`)
- Email/password login form
- Demo mode for testing without account
- Error handling & validation
- Responsive design with dark mode support

### 4. **Register Page** (`src/pages/Register.js`)
- User registration with name, email, password
- Input validation (email format, password strength)
- Password confirmation
- Link to switch between login/register
- Responsive design

### 5. **Auth UI Styles** (`src/styles/Auth.css`)
- Modern gradient design (purple/indigo theme)
- Responsive for mobile & desktop
- Dark mode support
- Smooth animations

### 6. **App Integration**
- App wrapped with `AuthProvider`
- Automatic route protection
- Shows auth screens for unauthenticated users
- Automatically switches to main app after login

## 🔧 Setup Instructions

### Step 1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New project"
4. Fill in project details:
   - **Name**: MoneyMa (or preferred name)
   - **Password**: Create a strong password
   - **Region**: Choose nearest to your users (recommended: Singapore/Tokyo for Thailand)

### Step 2: Get API Keys
1. After project creation, go to **Settings** > **API**
2. Copy these values:
   - **Project URL** → `REACT_APP_SUPABASE_URL`
   - **anon/public key** → `REACT_APP_SUPABASE_ANON_KEY`

### Step 3: Configure Environment Variables
1. Create `.env.local` file in project root (copy from `.env.example`):
   ```bash
   REACT_APP_SUPABASE_URL=https://your-project.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here
   ```

2. Restart your development server:
   ```bash
   npm start
   ```

### Step 4: Create Database Tables (Optional for Cloud Sync)

In Supabase SQL editor, run:

```sql
-- User profiles table
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table (for cloud sync)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount DECIMAL(10,2) NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  synced BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Error logs table (for crash reporting)
CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  error_message TEXT,
  error_stack TEXT,
  error_type TEXT,
  app_version TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS (Row Level Security)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can view their own transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions"
  ON transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own error logs"
  ON error_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can insert error logs"
  ON error_logs FOR INSERT
  WITH CHECK (true);
```

## 🚀 Install Dependencies

```bash
npm install @supabase/supabase-js
```

Or if using yarn:
```bash
yarn add @supabase/supabase-js
```

## 📝 Usage Examples

### Using Auth in Components

```javascript
import { useAuth } from '../services/AuthContext';

function MyComponent() {
  const { user, signOut, isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <p>Please log in</p>;
  }

  return (
    <div>
      <p>Welcome, {user.email}!</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

### Accessing Supabase Client Directly

```javascript
import SupabaseService from '../services/SupabaseService';

// Get client
const supabase = SupabaseService.getClient();

// Query data
const { data, error } = await supabase
  .from('transactions')
  .select('*')
  .eq('user_id', userId);
```

## ✨ Features

✅ **User Registration** - Sign up with email & password  
✅ **User Login** - Secure authentication  
✅ **Session Management** - Auto-login on page refresh  
✅ **Password Reset** - Recover forgotten passwords  
✅ **Demo Mode** - Test without account  
✅ **Dark Mode** - Works with existing dark mode  
✅ **Error Handling** - User-friendly error messages  
✅ **Mobile Responsive** - Works on all devices  

## 🔐 Security Notes

- **Passwords** are hashed server-side by Supabase
- **.env.local** should NOT be committed to git (add to .gitignore)
- **RLS policies** protect user data in database
- **Anonymous key** is safe to expose (use in frontend)
- **Service role key** should NEVER be exposed (use only in backend)

## 🐛 Troubleshooting

### "Supabase credentials not configured"
- Check `.env.local` exists with correct values
- Restart dev server after adding env variables
- Verify keys from Supabase Settings > API

### Login not working
- Check browser console for error messages
- Verify email/password are correct
- Ensure Supabase project is active
- Check network tab for failed requests

### Blank Login Page
- Check `src/pages/Login.js` file exists
- Verify imports are correct
- Check browser console for errors
- Ensure `AuthProvider` wraps the app

## 📚 Next Steps

1. **Phase 2: Cloud Backup/Sync** - Add cloud synchronization
2. **Phase 3: Crash Reporting** - Implement error tracking
3. **Consider adding**: Social login (Google, GitHub), 2FA, Profile photo

---

**Last Updated**: 21 March 2026
