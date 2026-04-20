# Phase 2: Cloud Backup / Sync - Complete Guide

## 📚 Overview

Phase 2 adds **cloud synchronization** to your MoneyMa app with these capabilities:

✅ **Upload Transactions** - Save local transactions to Supabase  
✅ **Download Transactions** - Fetch transactions from cloud  
✅ **Full Two-Way Sync** - Upload & download simultaneously  
✅ **Offline Support** - Queue transactions when offline  
✅ **Conflict Resolution** - Intelligently merge changes  
✅ **Sync Status UI** - Show sync progress to users  
✅ **Real-time Updates** - Optional live sync with WebSockets  

---

## 🏗️ Architecture

### Service Layer
```
SyncService
├── syncToCloud()        → Upload local → Cloud
├── syncFromCloud()      → Download cloud → Local
├── fullSync()           → Two-way sync
├── mergeTransactions()  → Intelligent merge
├── queueOfflineTransaction() → Queue when offline
└── processOfflineQueue() → Process when back online
```

### React Layer
```
useSync Hook
├── syncStatus    → Current sync state
├── isOnline      → Connection status
├── manualSync()  → Trigger manual sync
├── syncToCloud() → Upload only
└── syncFromCloud() → Download only
```

### UI Components
```
<SyncStatus />
├── Shows sync progress
├── Displays offline status
├── Queued transaction count
└── Retry button on failure
```

---

## 📁 Files Created

### Services (3 files)
- **`src/services/SyncService.js`** - Core sync logic
- **`src/services/useSync.js`** - React hook for sync
- **`src/services/AuthContext.js`** - Already exists from Phase 1

### Components (1 file)
- **`src/components/SyncStatus.js`** - UI status display

### Styles (1 file)
- **`src/styles/SyncStatus.css`** - Styling for sync UI

### Database (via Supabase)
- `transactions` table - Stores synced transactions
- `sync_history` table - Tracks sync status
- RLS policies - Security for data

---

## 🚀 Integration Steps

### Step 1: Add SyncStatus Component to Main App

Edit `src/App.js` and add the sync status at the top of MainApp:

```javascript
import SyncStatus from './components/SyncStatus';

function MainApp() {
  // ... existing code ...

  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <div className="app-backdrop" />
      
      {/* Add this line */}
      <SyncStatus />
      
      <nav className="sidebar">
        {/* ... rest of app ... */}
```

### Step 2: Use Hook in Dashboard/Transactions

Edit `src/pages/dashboard.js`:

```javascript
import { useSync } from '../services/useSync';

function Dashboard({ summary, transactions, t }) {
  const { syncStatus, manualSync } = useSync();

  const handleSync = async () => {
    await manualSync(transactions);
  };

  return (
    <div>
      {/* Add sync button */}
      <button onClick={handleSync}>
        🔄 Sync Transactions
      </button>
      
      {/* ... rest of dashboard ... */}
    </div>
  );
}
```

### Step 3: Auto-Sync on Transaction Changes (Optional)

Edit `src/pages/transactions.js`:

```javascript
import { useSync } from '../services/useSync';
import { useAuth } from '../services/AuthContext';

function Transactions({ transactions, onRefresh, t }) {
  const { user } = useAuth();
  const { syncToCloud, isOnline, queueOfflineTransaction } = useSync();

  const handleAddTransaction = async (newTx) => {
    // Add to local database first
    // ... your existing code ...

    // Then sync to cloud
    if (isOnline) {
      await syncToCloud([newTx]);
    } else {
      queueOfflineTransaction(newTx);
    }
  };

  return (
    // ... existing JSX ...
  );
}
```

### Step 4: Initial Sync on App Load (Optional)

Edit `src/App.js` MainApp function:

```javascript
function MainApp() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const { user } = useAuth();
  const { syncFromCloud } = useSync();

  // Add cloud sync on mount
  useEffect(() => {
    if (user) {
      // Download cloud transactions when user logs in
      syncFromCloud().then((cloudTransactions) => {
        if (cloudTransactions) {
          setTransactions(cloudTransactions);
        }
      });
    }
  }, [user]);

  // ... rest of existing code ...
```

---

## 💻 Usage Examples

### Manual Sync

```javascript
const { manualSync, syncStatus } = useSync();

const handleSyncClick = async () => {
  await manualSync(transactions);
  console.log('Sync status:', syncStatus.message);
};
```

### Monitor Sync Status

```javascript
const { syncStatus, isOnline } = useSync();

useEffect(() => {
  console.log('Status:', syncStatus.status);      // syncing, completed, failed
  console.log('Message:', syncStatus.message);    // User-friendly message
  console.log('Online:', isOnline);               // Connection status
  console.log('Items synced:', syncStatus.syncedCount);
}, [syncStatus, isOnline]);
```

### Upload Only

```javascript
const { syncToCloud } = useSync();

const uploadTransactions = async (txs) => {
  const result = await syncToCloud(txs);
  if (result.success) {
    console.log(`Uploaded ${result.syncedCount} transactions`);
  }
};
```

### Download Only

```javascript
const { syncFromCloud } = useSync();

const downloadTransactions = async () => {
  const cloudTransactions = await syncFromCloud();
  console.log('Downloaded:', cloudTransactions);
};
```

### Offline Queue

```javascript
const { queueOfflineTransaction, isOnline } = useSync();

const addTransaction = (tx) => {
  if (!isOnline) {
    queueOfflineTransaction(tx);
    console.log('Queued for sync when online');
  } else {
    // Sync immediately
    syncToCloud([tx]);
  }
};
```

---

## 🗄️ Database Schema

### transactions table
```sql
id UUID                 -- Unique ID
user_id UUID           -- Who owns it
type TEXT              -- 'income' or 'expense'
amount DECIMAL(10,2)   -- Transaction amount
category TEXT          -- Category (Salary, Food, etc.)
description TEXT       -- Description
date DATE              -- Transaction date
synced BOOLEAN         -- Has been synced?
created_at TIMESTAMP   -- When created
updated_at TIMESTAMP   -- Last update
```

### sync_history table
```sql
id UUID                -- Unique ID
user_id UUID           -- Who synced
status TEXT            -- pending, syncing, completed, failed
synced_count INTEGER   -- How many items synced
error_message TEXT     -- Error if failed
created_at TIMESTAMP   -- When synced
```

---

## 🔄 Sync Flow Diagram

```
Local Transaction Created
         ↓
   Check Online?
    ↙        ↖
  YES         NO
   ↓          ↓
Sync     Queue for Later
   ↓          ↓
Upload   (when online)
   ↓          ↓
Success  Process Queue
         ↓
      Upload to Cloud
         ↓
      Success
```

---

## 🟢 Online/Offline Handling

### Automatic Detection
- App listens to `online`/`offline` events
- Uses `navigator.onLine` API
- Updates sync status automatically

### Offline Behavior
```javascript
// When offline:
// 1. Add to offline queue
queueOfflineTransaction(transaction);

// 2. Show "Offline" status in UI
// 3. Process queue when connection restored
// 4. Retry automatically or on user click
```

### Connection Restored
```
Connection restored
         ↓
Show "Reconnected" message
         ↓
Process offline queue
         ↓
Sync to cloud
         ↓
Update UI
```

---

## 🐛 Error Handling

### Network Errors
```javascript
try {
  await syncToCloud(transactions);
} catch (error) {
  console.error('Sync failed:', error.message);
  // Error shown in SyncStatus component
  // User can click "Retry"
}
```

### Conflict Resolution
- Uses `updated_at` timestamp
- Keeps newer version
- Logs conflicts for review

### Silent Failures
- Errors don't crash app
- Shows in SyncStatus UI
- User can manually retry

---

## ⚡ Performance Tips

### 1. Batch Sync
```javascript
// Good: Sync multiple at once
await syncToCloud([tx1, tx2, tx3]);

// Avoid: Multiple individual syncs
await syncToCloud([tx1]);
await syncToCloud([tx2]);
await syncToCloud([tx3]);
```

### 2. Debounce Sync
```javascript
import { debounce } from 'lodash';

const debouncedSync = debounce(
  () => syncToCloud(transactions),
  2000 // Wait 2 seconds after last change
);

useEffect(() => {
  debouncedSync();
}, [transactions]);
```

### 3. Selective Sync
```javascript
// Only sync unsynced transactions
const unsyncedTxs = transactions.filter(tx => !tx.synced);
await syncToCloud(unsyncedTxs);
```

---

## 🔐 Security

✅ **RLS Policies** - Users can only see own data  
✅ **JWT Authentication** - Supabase handles auth  
✅ **SSL/TLS Encryption** - Secure in transit  
✅ **User Isolation** - Data never mixed  

---

## 📊 Monitoring

### View Sync History in Supabase
1. Go to Supabase Dashboard
2. Click "SQL Editor"
3. Run this query:
   ```sql
   SELECT * FROM sync_history 
   WHERE user_id = 'your-user-id'
   ORDER BY created_at DESC;
   ```

### Check Synced Transactions
```sql
SELECT COUNT(*) as synced_count 
FROM transactions 
WHERE user_id = 'your-user-id' AND synced = true;
```

---

## 🧪 Testing

### Test Online Sync
1. Add transaction
2. Check "Sync" status shows "Syncing"
3. Wait for "Completed"
4. Go to Supabase → see transaction in DB

### Test Offline Sync
1. Open DevTools (F12)
2. Go to Network tab
3. Check "Offline" checkbox
4. Add transaction (should queue)
5. Uncheck "Offline"
6. Should auto-sync

### Test Full Sync
1. Add transactions on different devices
2. Click "Sync" on both
3. Both should see all transactions

---

## 🚀 Advanced Features (Coming Soon)

- [ ] Realtime sync with WebSockets
- [ ] Selective field sync
- [ ] Compression for large datasets
- [ ] Delta sync (only send changes)
- [ ] Conflict resolution UI
- [ ] Sync encryption
- [ ] Bandwidth optimization
- [ ] Local indexing

---

## 🔗 Related Files

- `src/services/SyncService.js` - Core logic
- `src/services/useSync.js` - React hook
- `src/components/SyncStatus.js` - UI
- `supabase-schema.sql` - Database setup

---

## 📞 Troubleshooting

### Q: Transactions not syncing
**A:** Check:
1. Internet connection (use DevTools Network tab)
2. `.env.local` has correct Supabase credentials
3. User is authenticated
4. Database tables exist

### Q: "Synced" but not appearing on other device
**A:** 
1. Need to manually refresh or click Sync
2. Add real-time listeners (Phase 2 advanced)
3. Check RLS policies allow read access

### Q: Offline queue not processing
**A:**
1. Check connection restored (browser shows online)
2. Try manual sync with button
3. Check browser console for errors

---

## 📈 Usage Statistics

You can track:
- Total synced transactions
- Sync failures
- Average sync time
- Offline queue depth
- User engagement

---

## 🎯 Next Steps

1. ✅ Phase 1: Authentication (Complete)
2. ✅ Phase 2: Cloud Sync (You are here)
3. ⏳ Phase 3: Crash Reporting
4. 🎁 Phase 4: Advanced Features

Proceed to Phase 3 when ready!

---

**Last Updated**: 21 March 2026  
**Version**: 1.0.0  
**Status**: Ready for Production
