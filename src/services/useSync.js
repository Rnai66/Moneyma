/**
 * useSync Hook
 * React hook for managing cloud synchronization
 * 
 * Example:
 * const { syncStatus, manualSync, isOnline } = useSync();
 */

import { useEffect, useState, useCallback } from 'react';
import SyncService from './SyncService';
import { useAuth } from './AuthContext';

export const useSync = () => {
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState({
    status: 'idle', // idle, syncing, completed, failed, offline
    message: '',
    progress: 0,
    lastSync: null,
  });
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Subscribe to sync status changes
  useEffect(() => {
    const unsubscribe = SyncService.onSyncStatusChange((status) => {
      setSyncStatus((prev) => ({
        ...prev,
        ...status,
      }));
    });

    return unsubscribe;
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus((prev) => ({
        ...prev,
        message: 'Connected! Processing offline changes...',
      }));
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus((prev) => ({
        ...prev,
        status: 'offline',
        message: 'Offline - changes will sync when connected',
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Manual sync trigger
  const manualSync = useCallback(
    async (transactions) => {
      if (!user) {
        console.error('Not authenticated');
        return;
      }

      if (!isOnline) {
        setSyncStatus({
          status: 'offline',
          message: 'No internet connection',
        });
        return;
      }

      try {
        const result = await SyncService.fullSync(user.id, transactions);
        if (!result.success) {
           throw new Error(result.error);
        }
        return result.transactions;
      } catch (error) {
        console.error('Manual sync error:', error);
        setSyncStatus({
          status: 'failed',
          message: error.message,
        });
      }
    },
    [user, isOnline]
  );

  // Sync to cloud only
  const syncToCloud = useCallback(
    async (transactions) => {
      if (!user) {
        console.error('Not authenticated');
        return;
      }

      try {
        const result = await SyncService.syncToCloud(user.id, transactions);
        if (!result.success) {
          throw new Error(result.error);
        }
        return result;
      } catch (error) {
        console.error('Sync to cloud error:', error);
        setSyncStatus({
          status: 'failed',
          message: error.message,
        });
      }
    },
    [user]
  );

  // Download from cloud
  const syncFromCloud = useCallback(async () => {
    if (!user) {
      console.error('Not authenticated');
      return;
    }

    try {
      const result = await SyncService.syncFromCloud(user.id);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.transactions;
    } catch (error) {
      console.error('Sync from cloud error:', error);
      setSyncStatus({
        status: 'failed',
        message: error.message,
      });
    }
  }, [user]);

  // Queue offline transaction
  const queueOfflineTransaction = useCallback((transaction) => {
    SyncService.queueOfflineTransaction(transaction);
    setSyncStatus((prev) => ({
      ...prev,
      message: `Queued: ${SyncService.getSyncStatus().offlineQueueCount} changes waiting`,
    }));
  }, []);

  return {
    syncStatus,
    isOnline,
    manualSync,
    syncToCloud,
    syncFromCloud,
    queueOfflineTransaction,
    isSyncing: syncStatus.status === 'syncing',
  };
};
