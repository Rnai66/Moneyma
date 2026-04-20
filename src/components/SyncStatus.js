/**
 * SyncStatus Component
 * Displays cloud sync status in UI
 * Shows: syncing, online/offline, last sync time, queue count
 */

import React from 'react';
import { useSync } from '../services/useSync';
import '../styles/SyncStatus.css';

export default function SyncStatus() {
  const { syncStatus, isOnline, isSyncing, manualSync } = useSync();

  if (!syncStatus || syncStatus.status === 'idle') {
    return null;
  }

  const getStatusIcon = () => {
    switch (syncStatus.status) {
      case 'syncing':
        return '🔄';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      case 'offline':
        return '📡';
      default:
        return '💾';
    }
  };

  const getStatusColor = () => {
    switch (syncStatus.status) {
      case 'syncing':
        return '#3498db'; // blue
      case 'completed':
        return '#27ae60'; // green
      case 'failed':
        return '#e74c3c'; // red
      case 'offline':
        return '#f39c12'; // orange
      default:
        return '#95a5a6'; // gray
    }
  };

  return (
    <div className="sync-status" style={{ borderLeftColor: getStatusColor() }}>
      <div className="sync-status-content">
        <div className="sync-status-header">
          <span className="sync-status-icon">{getStatusIcon()}</span>
          <span className="sync-status-title">
            {syncStatus.status === 'syncing' ? 'Syncing...' : 'Sync Status'}
          </span>
          {!isOnline && <span className="sync-offline-badge">Offline</span>}
        </div>

        <p className="sync-status-message">{syncStatus.message}</p>

        {syncStatus.syncedCount && (
          <p className="sync-status-detail">
            ✓ Uploaded {syncStatus.syncedCount} transactions
          </p>
        )}

        {syncStatus.downloadedCount && (
          <p className="sync-status-detail">
            ↓ Downloaded {syncStatus.downloadedCount} transactions
          </p>
        )}

        {syncStatus.queuedCount && (
          <p className="sync-status-detail">
            ⏳ Queued {syncStatus.queuedCount} offline changes
          </p>
        )}

        {syncStatus.timestamp && (
          <p className="sync-status-time">
            Last sync: {new Date(syncStatus.timestamp).toLocaleTimeString()}
          </p>
        )}

        {syncStatus.status === 'failed' && !isSyncing && (
          <button className="sync-retry-button" onClick={manualSync}>
            Retry Sync
          </button>
        )}

        {syncStatus.status === 'offline' && isOnline && (
          <div className="sync-reconnected">
            <p>Connection restored!</p>
            <button className="sync-retry-button" onClick={manualSync}>
              Sync Now
            </button>
          </div>
        )}
      </div>

      {isSyncing && <div className="sync-progress-bar" />}
    </div>
  );
}
