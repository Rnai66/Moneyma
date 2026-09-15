/**
 * SyncService
 * Handles cloud synchronization of transactions
 * - Uploads local transactions to Supabase
 * - Downloads remote transactions
 * - Handles offline scenarios
 * - Manages sync conflicts
 */

import SupabaseService from './SupabaseService';
import { getDeletedIds, unmarkDeleted } from './deletedTransactions';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

class SyncService {
  constructor() {
    this.isSyncing = false;
    this.syncListeners = [];
    this.lastSyncTimestamp = null;
    this.offlineQueue = [];
  }

  /**
   * Subscribe to sync status changes
   * @param {function} callback - Called with sync progress
   * @returns {function} Unsubscribe function
   */
  onSyncStatusChange(callback) {
    this.syncListeners.push(callback);
    return () => {
      this.syncListeners = this.syncListeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Notify all listeners of sync status
   */
  notifySyncStatus(status) {
    this.syncListeners.forEach((callback) => {
      try {
        callback(status);
      } catch (error) {
        console.error('Sync listener error:', error);
      }
    });
  }

  /**
   * Sync transactions to cloud
   * @param {string} userId - User ID
   * @param {array} localTransactions - Transactions to sync
   * @returns {Promise} Sync result
   */
  async syncToCloud(userId, localTransactions) {
    if (!userId) {
      throw new Error('User ID required for sync');
    }

    try {
      this.isSyncing = true;
      this.notifySyncStatus({
        status: 'syncing',
        message: 'Uploading transactions to cloud...',
        progress: 0,
      });

      // Add user_id to transactions for cloud and sanitize UUIDs & dates
      const transactionsToSync = (localTransactions || []).map((tx) => {
        const isValidUUID = typeof tx.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tx.id);
        let cleanDate = new Date().toISOString().split('T')[0];
        if (typeof tx.date === 'string' && tx.date.trim()) {
          cleanDate = tx.date.trim().slice(0, 10);
        }

        return {
          id: isValidUUID ? tx.id : generateUUID(),
          user_id: userId,
          type: tx.type === 'income' ? 'income' : 'expense',
          amount: Math.abs(Number(tx.amount)) || 0,
          category: typeof tx.category === 'string' && tx.category.trim() ? tx.category.trim() : 'อื่น ๆ',
          description: typeof tx.description === 'string' ? tx.description : '',
          date: cleanDate,
          updated_at: SyncService.timestampOf(tx) || new Date().toISOString(),
        };
      });

      // Upload to Supabase
      const { transactions, remapped, error } = await SupabaseService.saveTransactions(
        userId,
        transactionsToSync
      );

      if (error) throw error;

      this.lastSyncTimestamp = new Date().toISOString();

      this.notifySyncStatus({
        status: 'completed',
        message: `Synced ${transactions?.length || 0} transactions`,
        syncedCount: transactions?.length || 0,
        timestamp: this.lastSyncTimestamp,
      });

      return { success: true, syncedCount: transactions?.length || 0, remapped: remapped || [] };
    } catch (error) {
      console.error('Sync to cloud error:', error);

      this.notifySyncStatus({
        status: 'failed',
        message: error.message || 'Failed to sync transactions',
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Download transactions from cloud
   * @param {string} userId - User ID
   * @returns {Promise} Downloaded transactions
   */
  async syncFromCloud(userId) {
    if (!userId) {
      throw new Error('User ID required for sync');
    }

    try {
      this.notifySyncStatus({
        status: 'syncing',
        message: 'Downloading transactions from cloud...',
      });

      const { transactions, error } = await SupabaseService.getTransactions(userId);

      if (error) throw error;

      this.notifySyncStatus({
        status: 'completed',
        message: `Downloaded ${transactions?.length || 0} transactions`,
        downloadedCount: transactions?.length || 0,
      });

      return {
        success: true,
        transactions: transactions || [],
        downloadedCount: transactions?.length || 0,
      };
    } catch (error) {
      console.error('Sync from cloud error:', error);

      this.notifySyncStatus({
        status: 'failed',
        message: error.message || 'Failed to download transactions',
        error: error.message,
      });

      return {
        success: false,
        transactions: [],
        error: error.message,
      };
    }
  }

  /**
   * Perform full two-way sync
   * 1. Upload local transactions
   * 2. Download cloud transactions
   * 3. Merge intelligently
   */
  async fullSync(userId, localTransactions) {
    if (!userId) {
      throw new Error('User ID required for sync');
    }

    try {
      this.isSyncing = true;

      /**
       * ขั้น 0 — เคลียร์รายการที่ผู้ใช้ลบไปแล้วก่อนทำอย่างอื่น
       * ถ้าข้ามขั้นนี้ แถวที่ลบจะถูกอัปโหลดกลับขึ้นไป (ถ้ายังอยู่ใน local)
       * หรือถูกดาวน์โหลดกลับลงมา (ถ้ายังอยู่บนคลาวด์) แล้วโผล่ให้ผู้ใช้เห็นอีก
       */
      const deletedIds = getDeletedIds();
      if (deletedIds.size) {
        const { deleted } = await SupabaseService.deleteTransactions(userId, [...deletedIds]);
        // ลบบนคลาวด์สำเร็จแล้วค่อยทิ้ง tombstone — ถ้าเน็ตพังไว้รอบหน้าลองใหม่
        if (deleted.length) unmarkDeleted(deleted);
      }

      // ห้ามอัปโหลดสิ่งที่ผู้ใช้ลบไปแล้ว
      const uploadable = (localTransactions || []).filter((tx) => !deletedIds.has(tx?.id));

      // Step 1: Upload local transactions
      const uploadResult = await this.syncToCloud(userId, uploadable);

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload transactions');
      }

      /**
       * ถ้าคลาวด์ต้องออก id ใหม่ให้แถวไหน (id เดิมเป็นของผู้ใช้คนก่อนบนเครื่องนี้)
       * ต้องเขียน id ใหม่ทับของเดิมในชุด local ตรงนี้ ไม่งั้นรอบหน้าชนซ้ำ
       * แล้วแทรกแถวใหม่อีกใบ — คือต้นเหตุที่ database บวมขึ้นเรื่อย ๆ
       */
      const remap = new Map((uploadResult.remapped || []).map((r) => [r.from, r.to]));
      const localAfterRemap = remap.size
        ? uploadable.map((tx) => (remap.has(tx?.id) ? { ...tx, id: remap.get(tx.id) } : tx))
        : uploadable;

      // Step 2: Download cloud transactions
      const downloadResult = await this.syncFromCloud(userId);

      if (!downloadResult.success) {
        throw new Error(downloadResult.error || 'Failed to download transactions');
      }

      // Step 3: Merge & deduplicate (ไม่เอาสิ่งที่ถูกลบกลับมา)
      const merged = this.mergeTransactions(
        localAfterRemap,
        downloadResult.transactions,
        deletedIds
      );

      this.notifySyncStatus({
        status: 'completed',
        message: 'Full sync completed',
        syncedCount: uploadResult.syncedCount,
        downloadedCount: downloadResult.downloadedCount,
        totalCount: merged.length,
        timestamp: this.lastSyncTimestamp,
      });

      return {
        success: true,
        transactions: merged,
        syncedCount: uploadResult.syncedCount,
        downloadedCount: downloadResult.downloadedCount,
      };
    } catch (error) {
      console.error('Full sync error:', error);

      this.notifySyncStatus({
        status: 'failed',
        message: error.message || 'Sync failed',
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Resolve a comparable timestamp for a transaction.
   * Falls back through the field names used across local storage and Supabase,
   * then to the transaction date, then to 0 — never NaN, so comparisons are
   * always meaningful (the old code compared NaN and cloud silently always won).
   * @returns {string|null} ISO string, or null when nothing usable exists
   */
  static timestampOf(tx) {
    const candidates = [
      tx?.updated_at,
      tx?.updatedAt,
      tx?.created_at,
      tx?.createdAt,
    ];

    for (const raw of candidates) {
      if (!raw) continue;
      const ms = new Date(raw).getTime();
      if (Number.isFinite(ms)) return new Date(ms).toISOString();
    }

    return null;
  }

  static timeValueOf(tx) {
    const iso = SyncService.timestampOf(tx);
    if (iso) return new Date(iso).getTime();

    // last resort: the transaction's own date (day precision)
    const dayMs = tx?.date ? new Date(tx.date).getTime() : NaN;
    return Number.isFinite(dayMs) ? dayMs : 0;
  }

  /**
   * Merge local and cloud transactions.
   * Deduplicates by id; the most recently updated copy wins.
   */
  mergeTransactions(local = [], cloud = [], deletedIds = new Set()) {
    const merged = new Map();
    // 🔴 ตัวกรองนี้คือสิ่งที่ทำให้ "ลบแล้วหายจริง"
    // ถ้าไม่มี แถวที่ยังค้างบนคลาวด์จะถูกใส่กลับเข้าชุดผลลัพธ์
    // แล้ว App.js เขียนทับ localStorage = รายการที่ลบไปโผล่กลับมาเอง
    const isDeleted = (id) => deletedIds && deletedIds.has(id);

    cloud.forEach((tx) => {
      if (tx?.id && !isDeleted(tx.id)) merged.set(tx.id, { ...tx, synced: true });
    });

    local.forEach((tx) => {
      if (!tx?.id || isDeleted(tx.id)) return;

      const existing = merged.get(tx.id);
      if (!existing) {
        merged.set(tx.id, { ...tx, synced: true });
        return;
      }

      const localTime = SyncService.timeValueOf(tx);
      const cloudTime = SyncService.timeValueOf(existing);

      // strictly newer local edit replaces the cloud copy
      if (localTime > cloudTime) {
        merged.set(tx.id, {
          ...existing,
          ...tx,
          synced: true,
          updated_at: SyncService.timestampOf(tx) || existing.updated_at,
        });
      }
    });

    return Array.from(merged.values()).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
  }

  /**
   * Add transaction to offline queue
   * Used when internet is unavailable
   */
  queueOfflineTransaction(transaction) {
    this.offlineQueue.push({
      ...transaction,
      queuedAt: new Date().toISOString(),
    });

    this.notifySyncStatus({
      status: 'offline',
      message: `Queued offline: ${this.offlineQueue.length} transactions waiting`,
      queuedCount: this.offlineQueue.length,
    });
  }

  /**
   * Process offline queue
   * Called when connection is restored
   */
  async processOfflineQueue(userId) {
    if (this.offlineQueue.length === 0) {
      return { success: true, processedCount: 0 };
    }

    try {
      this.notifySyncStatus({
        status: 'syncing',
        message: `Syncing ${this.offlineQueue.length} offline transactions...`,
      });

      const { error } = await SupabaseService.saveTransactions(
        userId,
        this.offlineQueue.map((tx) => ({
          id: tx.id,
          user_id: userId,
          type: tx.type,
          amount: parseFloat(tx.amount),
          category: tx.category,
          description: tx.description || '',
          date: tx.date,
        }))
      );

      if (error) throw error;

      const processedCount = this.offlineQueue.length;
      this.offlineQueue = [];

      this.notifySyncStatus({
        status: 'completed',
        message: `Synced ${processedCount} offline transactions`,
        processedCount,
      });

      return { success: true, processedCount };
    } catch (error) {
      console.error('Process offline queue error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    return {
      isSyncing: this.isSyncing,
      lastSync: this.lastSyncTimestamp,
      offlineQueueCount: this.offlineQueue.length,
    };
  }

  /**
   * Clear offline queue (use with caution)
   */
  clearOfflineQueue() {
    this.offlineQueue = [];
  }
}

// Export singleton
const syncServiceInstance = new SyncService();
export default syncServiceInstance;
