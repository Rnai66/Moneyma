# Quick Reference Guide

## 🚀 Getting Started (First Time)

```bash
# 1. Install dependencies
npm install @supabase/supabase-js

# 2. Verify .env.local exists
cat .env.local
# Should show:
# REACT_APP_SUPABASE_URL=https://...
# REACT_APP_SUPABASE_ANON_KEY=...

# 3. Start development server
npm start

# 4. App opens at http://localhost:3000
```

---

## 🔑 Using Authentication

### In Components
```javascript
import { useAuth } from '../services/AuthContext';

function MyComponent() {
  const { user, isAuthenticated, signOut } = useAuth();

  if (!isAuthenticated) return <p>Not logged in</p>;

  return (
    <div>
      <p>Welcome {user.email}</p>
      <button onClick={signOut}>Logout</button>
    </div>
  );
}
```

### Sign Up
```javascript
const { signUp } = useAuth();

const { user, error } = await signUp('user@email.com', 'password123', {
  firstName: 'John',
  lastName: 'Doe',
});

if (error) console.error(error);
```

### Sign In
```javascript
const { signIn } = useAuth();

const { user, error } = await signIn('user@email.com', 'password123');
```

### Sign Out
```javascript
const { signOut } = useAuth();

await signOut();
// User logged out, redirected to login page
```

---

## ☁️ Using Cloud Sync

### In Components
```javascript
import { useSync } from '../services/useSync';

function Transactions() {
  const { syncStatus, manualSync, isOnline } = useSync();

  return (
    <div>
      {!isOnline && <p>⚠️ Offline mode</p>}
      <button onClick={() => manualSync(transactions)}>
        {syncStatus.message}
      </button>
    </div>
  );
}
```

### Manual Sync
```javascript
const { manualSync } = useSync();

await manualSync(transactions);
// Uploads local → downloads from cloud
// Merges and deduplicates
```

### Offline Queue
```javascript
const { queueOfflineTransaction, isOnline } = useSync();

if (!isOnline) {
  queueOfflineTransaction(newTransaction);
  // Queued locally, will sync when online
}
```

### Sync Status
```javascript
const { syncStatus } = useSync();

console.log(syncStatus);
// {
//   status: 'completed',     // syncing, completed, failed, offline
//   message: 'Synced 5...',
//   syncedCount: 5,
//   downloadedCount: 10,
//   timestamp: '2024-03-21T...'
// }
```

---

## 🗄️ Supabase Service

### Direct Database Access
```javascript
import SupabaseService from '../services/SupabaseService';

const supabase = SupabaseService.getClient();

// Query transactions
const { data, error } = await supabase
  .from('transactions')
  .select('*')
  .eq('user_id', userId);

// Insert transaction
const { data, error } = await supabase
  .from('transactions')
  .insert([{ user_id: userId, amount: 100, ... }]);

// Update transaction
await supabase
  .from('transactions')
  .update({ amount: 200 })
  .eq('id', transactionId);

// Delete transaction
await supabase
  .from('transactions')
  .delete()
  .eq('id', transactionId);
```

---

## 🎨 UI Components

### Show Sync Status
```javascript
import SyncStatus from './components/SyncStatus';

function App() {
  return (
    <div>
      <SyncStatus />
      {/* Your app content */}
    </div>
  );
}
```

### Login Page
```javascript
import Login from '../pages/Login';

<Login 
  onSwitchToRegister={() => setMode('register')}
  onLoginSuccess={() => loadApp()}
/>
```

### Register Page
```javascript
import Register from '../pages/Register';

<Register 
  onSwitchToLogin={() => setMode('login')}
  onRegisterSuccess={() => loadApp()}
/>
```

---

## 📁 File Structure

```
src/
├── services/
│   ├── SupabaseService.js  → Auth API + DB
│   ├── AuthContext.js      → Global auth state
│   ├── SyncService.js      → Cloud sync logic
│   └── useSync.js          → React sync hook
├── pages/
│   ├── Login.js            → Login UI
│   ├── Register.js         → Registration UI
│   ├── dashboard.js        → Dashboard (existing)
│   ├── transactions.js     → Transactions (existing)
│   └── ...
├── components/
│   ├── SyncStatus.js       → Sync status UI
│   └── ...
└── styles/
    ├── Auth.css            → Auth styling
    ├── SyncStatus.css      → Sync styling
    └── ...
```

---

## 🛠️ Common Tasks

### Check if User is Logged In
```javascript
const { isAuthenticated } = useAuth();

if (isAuthenticated) {
  // Show authenticated content
} else {
  // Redirect to login
}
```

### Get Current User
```javascript
const { user } = useAuth();

console.log(user.id);                    // UUID
console.log(user.email);                 // Email
console.log(user.user_metadata);         // Custom data
```

### Update User Profile
```javascript
import SupabaseService from '../services/SupabaseService';
import { useAuth } from '../services/AuthContext';

const { user } = useAuth();

await SupabaseService.updateUserProfile(user.id, {
  first_name: 'John',
  last_name: 'Doe',
});
```

### Fetch Transactions
```javascript
const { user } = useAuth();
const { transactions, error } = await SupabaseService.getTransactions(user.id);
```

### Save Transactions
```javascript
const { user } = useAuth();
const { transactions, error } = await SupabaseService.saveTransactions(
  user.id,
  [{ type: 'income', amount: 5000, ... }]
);
```

### Check Online Status
```javascript
const { isOnline } = useSync();

if (!isOnline) {
  console.log('Offline - changes will sync when connected');
}
```

---

## 🧪 Testing Commands

```bash
# Test Supabase connection
node test-supabase.js

# Start dev server
npm start

# Build for production
npm run build

# Test on Android
npm run build && npx cap copy android && npx cap open android

# Test on iOS
npm run build && npx cap copy ios && npx cap open ios
```

---

## 🔐 Environment Variables

```env
# Required for auth/sync
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key

# Optional for features
REACT_APP_API_URL=https://api.example.com
REACT_APP_LOG_LEVEL=debug
```

---

## 🐛 Debugging

### Enable Verbose Logging
```javascript
// In src/App.js or main component
if (process.env.NODE_ENV === 'development') {
  console.log('Auth state:', useAuth());
  console.log('Sync status:', useSync().syncStatus);
}
```

### Check Browser Storage
```javascript
// In browser DevTools Console
localStorage.getItem('sb-nvgqqhqoarkfulsebepj-auth-token')
// Shows current session

JSON.parse(localStorage.getItem('darkMode'))
// Shows your settings
```

### Monitor Network
1. Open DevTools (F12)
2. Go to Network tab
3. Filter by "supabase"
4. Watch API calls
5. Check for 401 (auth), 403 (permissions), 500 (server)

### Check Offline Queue
```javascript
// In browser DevTools Console
import SyncService from './src/services/SyncService';
SyncService.getSyncStatus()
// Shows: { isSyncing, lastSync, offlineQueueCount }
```

---

## 🚀 Deployment Checklist

- [ ] Update `.env.local` with production Supabase keys
- [ ] Run `npm run build`
- [ ] Test build locally: `npm run start -- --prod`
- [ ] Check browser console for errors
- [ ] Test on mobile (if deploying app)
- [ ] Deploy to hosting (Vercel, Netlify, etc.)
- [ ] Test login on production
- [ ] Monitor Supabase dashboard for errors
- [ ] Set up error alerts

---

## 📞 Common Issues

### Issue: "Supabase credentials not configured"
**Solution**: Check `.env.local` exists and `npm start` was run after creating it

### Issue: Login doesn't work
**Solution**: 
1. Check email format is valid
2. Check password is 6+ characters
3. Verify Supabase project is active
4. Check browser console (F12) for error details

### Issue: Sync stuck on "Syncing"
**Solution**:
1. Check internet connection
2. Verify Supabase project is running
3. Check browser Network tab for failed requests
4. Refresh page

### Issue: Still logged in after signing out
**Solution**: Browser cached login, clear localStorage:
```javascript
localStorage.clear()
location.reload()
```

### Issue: Transactions not appearing after sync
**Solution**:
1. Go to Supabase dashboard → SQL Editor
2. Run: `SELECT COUNT(*) FROM transactions WHERE user_id='your-id'`
3. Check RLS policies allow access
4. Try manual sync

---

## 📚 Important Docs

- **PHASE_1_COMPLETE.md** - What was built
- **PHASE_2_GUIDE.md** - How to use cloud sync
- **AUTH_DEEP_DIVE.md** - How auth really works
- **AUTH_API_REFERENCE.md** - Code examples
- **SETUP_CHECKLIST.md** - Initial setup steps

---

## 🆘 Getting Help

1. **Check documentation first** - Most answers in the MD files
2. **Check browser console** - Error details (F12 → Console)
3. **Check Network tab** - See failed API requests
4. **Check Supabase dashboard** - See database state
5. **Read error message carefully** - Usually tells you what's wrong

---

## 🎯 Next Features to Build

1. **Phase 3: Crash Reporting** - Auto-report errors
2. **Real-time Sync** - WebSocket updates
3. **Social Login** - Google, GitHub
4. **2FA** - Two-factor authentication
5. **Profile Pictures** - User avatars
6. **Email Verification** - Confirm email address

---

**Last Updated**: 21 March 2026  
**Quick Reference for**: Developers  
**Print Friendly**: Save this as PDF for quick access!
