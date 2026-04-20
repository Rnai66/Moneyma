# Phase 1 Setup Checklist

## ✅ Pre-Setup (2 minutes)

- [ ] Read `PHASE_1_COMPLETE.md` (overview of what was built)
- [ ] Read `AUTH_SETUP_GUIDE.md` (detailed setup instructions)
- [ ] Read `AUTH_API_REFERENCE.md` (how to use authentication in code)

---

## 🔧 Development Setup (5 minutes)

### 1. Install Dependencies
```bash
npm install @supabase/supabase-js
```
- [ ] Command completed successfully
- [ ] No errors in console

### 2. Create Supabase Project
- [ ] Go to [supabase.com](https://supabase.com)
- [ ] Sign up or log in
- [ ] Create new project
- [ ] Copy Project URL from Settings > API
- [ ] Copy anon/public key from Settings > API

### 3. Setup Environment Variables
- [ ] Create `.env.local` file in project root
- [ ] Copy content from `.env.example`
- [ ] Set `REACT_APP_SITE_URL` to your deployed web URL
- [ ] Paste Supabase URL as `REACT_APP_SUPABASE_URL`
- [ ] Paste anon key as `REACT_APP_SUPABASE_ANON_KEY`
- [ ] Paste Firebase Web SDK values as `REACT_APP_FIREBASE_*`
- [ ] Save file (⚠️ never commit `.env.local` to git)

### 4. Restart Dev Server
```bash
npm start
```
- [ ] App starts without errors
- [ ] Login page appears when visiting app
- [ ] Console shows no warnings about missing credentials

---

## 🗄️ Database Setup (Optional, for Cloud Features)

### 5. Create Database Tables
- [ ] Go to Supabase project > SQL Editor
- [ ] Create new query
- [ ] Copy SQL from `AUTH_SETUP_GUIDE.md`
- [ ] Run query
- [ ] Tables created: `user_profiles`, `transactions`, `error_logs`
- [ ] RLS policies enabled

---

## 🧪 Testing (5 minutes)

### 6. Test User Registration
- [ ] Click "Sign up here" on login page
- [ ] Fill in: First name, Last name, Email, Password
- [ ] Click "Create Account"
- [ ] Should see main app dashboard
- [ ] Verify email is correct in Settings (if implemented)

### 7. Test User Login
- [ ] Click "Sign In" from logo
- [ ] Enter registered email & password
- [ ] Click "Sign In"
- [ ] Should see main app dashboard
- [ ] Check user is authenticated in Settings

### 8. Test Session Persistence
- [ ] Log in with test account
- [ ] Refresh page (Cmd+R or F5)
- [ ] Should remain logged in (no redirect to login)
- [ ] User data should load normally

### 9. Test Sign Out
- [ ] Go to Settings page
- [ ] Look for sign out button (to be added)
- [ ] Click sign out
- [ ] Should redirect to login page

### 10. Test Demo Mode
- [ ] Go to login page
- [ ] Click "Continue as Guest"
- [ ] Should access main app without account
- [ ] Session lost on page refresh

### 11. Test Error Handling
- [ ] Try signing up with invalid email
- [ ] Should show "invalid email" error
- [ ] Try signing in with wrong password
- [ ] Should show error message
- [ ] Try registering with existing email
- [ ] Should show error message

---

## 🔐 Security Checklist

### 12. Verify Security Setup
- [ ] `.env.local` is in `.gitignore` (not committed)
- [ ] Sensitive keys not logged in console
- [ ] HTTPS used in production (Supabase provides this)
- [ ] RLS policies enabled on all tables
- [ ] Anonymous key used in frontend (not service role key)
- [ ] Password min 6 characters enforced

---

## 📝 Code Integration (Optional)

### 13. Add Logout to Settings (Enhancement)

In `src/pages/settings.js`, add:

```javascript
import { useAuth } from '../services/AuthContext';

function Settings() {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    window.location.reload();
  };

  return (
    <div>
      {/* ... existing settings ... */}
      <button onClick={handleSignOut}>
        Sign Out ({user?.email})
      </button>
    </div>
  );
}
```

- [ ] Logout button added to Settings
- [ ] Signs out user when clicked
- [ ] Redirects to login page

---

## 🚀 Production Deployment

### 14. Before Going Live
- [ ] Test with real Supabase production project
- [ ] Update `.env.local` with production credentials
- [ ] Copy `.firebaserc.example` to `.firebaserc` and set your Firebase project ID
- [ ] Add GitHub Actions secrets for `REACT_APP_*` values and `FIREBASE_TOKEN`
- [ ] Run full test suite
- [ ] Test on mobile devices
- [ ] Check dark mode works
- [ ] Monitor Supabase dashboard for errors
- [ ] Set up email verification (optional)

---

## ✨ Next Steps After Phase 1

Once auth is working, you can build:

### Phase 2: Cloud Backup / Sync ☁️
- Sync transactions to Supabase
- Implement offline-first sync
- Handle conflict resolution
- See: `SupabaseService.saveTransactions()`

### Phase 3: Crash Reporting 🐛
- Auto-report crashes to Supabase
- Track app errors by user
- See: `SupabaseService.logError()`

### Additional Features 🎁
- [ ] Social login (Google, GitHub)
- [ ] Two-factor authentication
- [ ] Email verification
- [ ] Profile pictures
- [ ] Password strength meter
- [ ] Account recovery options

---

## 📞 Troubleshooting

### Issue: "Supabase credentials not configured"
**Solution**: 
- Check `.env.local` exists
- Verify URL and key are correct
- Restart dev server: `npm start`

### Issue: Login page is blank
**Solution**:
- Check browser console for errors
- Verify `src/pages/Login.js` exists
- Check `src/pages/Register.js` exists
- Verify imports in `src/App.js`

### Issue: Can't sign up / "Invalid login credentials"
**Solution**:
- Check email format is valid
- Verify password is at least 6 characters
- Check Supabase project is active
- Look for error in browser console
- Check Supabase authentication logs

### Issue: Still logged in after refresh (unexpected)
**Solution**:
- This is correct behavior! Auth context auto-restores session
- Clear cookies/localStorage if you want to force logout

---

## 📚 Documentation

- **PHASE_1_COMPLETE.md** - Overview of implementation
- **AUTH_SETUP_GUIDE.md** - Detailed setup guide
- **AUTH_API_REFERENCE.md** - Code examples & API reference
- **This document** - Setup checklist

---

## ✅ Completion Status

**When all checkboxes are complete:**
- ✅ Your app has a working authentication system
- ✅ Users can create accounts and log in
- ✅ Sessions persist across page refreshes
- ✅ Ready for Phase 2: Cloud Backup/Sync
- ✅ Ready for Phase 3: Crash Reporting

---

## 🎉 You're Done!

Congratulations! Your MoneyMa app now has a complete authentication system using Supabase.

**Total Setup Time**: ~15-20 minutes

**Next**: Proceed to Phase 2 for cloud synchronization features.

---

**Last Updated**: 21 March 2026  
**Version**: 1.0.0
