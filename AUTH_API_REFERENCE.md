# Authentication API Reference

Quick reference for using the authentication system in MoneyMa.

## 🔗 useAuth() Hook

The primary way to access authentication in your components.

```javascript
import { useAuth } from '../services/AuthContext';

function MyComponent() {
  const auth = useAuth();
}
```

### Properties

```javascript
const {
  user,              // Authenticated user object (or null)
  session,           // Current session object (or null)
  loading,           // Boolean - true while checking auth
  error,             // Error object (or null)
  isAuthenticated,   // Boolean - true if logged in
  signUp,            // Function - sign up new user
  signIn,            // Function - sign in with email/password
  signOut,           // Function - log out current user
  resetPassword,     // Function - send password reset email
  updatePassword,    // Function - change password
} = useAuth();
```

---

## 📝 Methods

### Sign Up

Create a new user account.

```javascript
const { user, error } = await signUp(
  'user@example.com',
  'password123',
  {
    firstName: 'John',
    lastName: 'Doe',
  }
);

if (error) {
  console.error('Sign up failed:', error.message);
} else {
  console.log('Signed up:', user.email);
}
```

**Parameters:**
- `email` (string) - User's email address
- `password` (string) - User's password (min 6 characters)
- `metadata` (object, optional) - Additional user data

**Returns:**
- `{ user, error }` - User object or error

---

### Sign In

Log in with email and password.

```javascript
const { user, error } = await signIn(
  'user@example.com',
  'password123'
);

if (error) {
  console.error('Login failed:', error.message);
} else {
  console.log('Logged in as:', user.email);
}
```

**Parameters:**
- `email` (string) - User's email
- `password` (string) - User's password

**Returns:**
- `{ user, error }` - User object or error

---

### Sign Out

Log out the current user.

```javascript
const { error } = await signOut();

if (error) {
  console.error('Sign out failed:', error.message);
} else {
  console.log('Logged out');
}
```

**Returns:**
- `{ error }` - Error object (or null if successful)

---

### Reset Password

Send password reset email.

```javascript
const { error } = await resetPassword('user@example.com');

if (error) {
  console.error('Reset failed:', error.message);
} else {
  console.log('Reset email sent');
}
```

**Parameters:**
- `email` (string) - User's email address

**Returns:**
- `{ error }` - Error object (or null if successful)

---

### Update Password

Change user's password (requires authorization).

```javascript
const { error } = await updatePassword('newpassword123');

if (error) {
  console.error('Update failed:', error.message);
} else {
  console.log('Password updated');
}
```

**Parameters:**
- `newPassword` (string) - New password (min 6 characters)

**Returns:**
- `{ error }` - Error object (or null if successful)

---

## 🗄️ SupabaseService Direct Access

For direct database operations, use the Supabase service.

```javascript
import SupabaseService from '../services/SupabaseService';

const supabase = SupabaseService.getClient();
```

### Get User Profile

```javascript
const { profile, error } = await SupabaseService.getUserProfile(userId);
```

### Update User Profile

```javascript
const { profile, error } = await SupabaseService.updateUserProfile(
  userId,
  {
    first_name: 'John',
    last_name: 'Doe',
  }
);
```

### Save Transactions

```javascript
const { transactions, error } = await SupabaseService.saveTransactions(
  userId,
  [
    {
      type: 'income',
      amount: 5000,
      category: 'Salary',
      description: 'Monthly salary',
      date: '2024-03-21',
    },
  ]
);
```

### Get Transactions

```javascript
const { transactions, error } = await SupabaseService.getTransactions(userId);
```

### Log Error

```javascript
const { error } = await SupabaseService.logError(
  userId,
  {
    message: 'Transaction not found',
    stack: error.stack,
    type: 'DataError',
    appVersion: '1.3.0',
  }
);
```

---

## 🛡️ Protected Components

Example: Component that requires authentication.

```javascript
import { useAuth } from '../services/AuthContext';

function PrivateComponent() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <p>Loading...</p>;
  }

  if (!isAuthenticated) {
    return <p>Please log in to access this content</p>;
  }

  return <div>Private content here</div>;
}
```

---

## 📡 Current User

Get current authenticated user.

```javascript
const { user } = useAuth();

if (user) {
  console.log('User ID:', user.id);
  console.log('Email:', user.email);
  console.log('Metadata:', user.user_metadata);
}
```

**User Object:**
```javascript
{
  id: 'uuid',
  email: 'user@example.com',
  user_metadata: {
    firstName: 'John',
    lastName: 'Doe',
  },
  created_at: '2024-03-21T10:00:00Z',
  // ... other fields
}
```

---

## ⚠️ Error Handling

All async methods return `{ data, error }` pattern.

```javascript
const { user, error } = await signIn(email, password);

if (error) {
  // Handle specific error types
  if (error.message.includes('Invalid login credentials')) {
    console.log('Wrong email or password');
  } else if (error.message.includes('User not found')) {
    console.log('Email not registered');
  } else {
    console.log('Unknown error:', error.message);
  }
}
```

---

## 🌍 Using in Components

### Complete Example

```javascript
import React, { useState } from 'react';
import { useAuth } from '../services/AuthContext';

function UserProfile() {
  const { user, signOut, error } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    const { error } = await signOut();
    if (error) {
      console.error('Sign out failed:', error);
    }
    setLoading(false);
  };

  if (!user) {
    return <p>Not logged in</p>;
  }

  return (
    <div>
      <h1>Welcome, {user.email}!</h1>
      <button onClick={handleSignOut} disabled={loading}>
        {loading ? 'Signing out...' : 'Sign Out'}
      </button>
      {error && <p style={{ color: 'red' }}>{error.message}</p>}
    </div>
  );
}

export default UserProfile;
```

---

## 🔗 Related Files

- **SupabaseService**: `src/services/SupabaseService.js`
- **AuthContext**: `src/services/AuthContext.js`
- **Login Page**: `src/pages/Login.js`
- **Register Page**: `src/pages/Register.js`
- **Setup Guide**: `AUTH_SETUP_GUIDE.md`

---

## 📚 References

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Supabase JS SDK](https://supabase.com/docs/reference/javascript)
- [React Hooks](https://react.dev/reference/react)

---

**Last Updated**: 21 March 2026
