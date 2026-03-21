const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Transaction APIs
  getTransactions: (filters) => ipcRenderer.invoke('get-transactions', filters),
  addTransaction: (transaction) => ipcRenderer.invoke('add-transaction', transaction),
  updateTransaction: (id, transaction) => ipcRenderer.invoke('update-transaction', id, transaction),
  deleteTransaction: (id) => ipcRenderer.invoke('delete-transaction', id),

  // Statistics APIs
  getStatistics: (period) => ipcRenderer.invoke('get-statistics', period),
  getSummary: () => ipcRenderer.invoke('get-summary'),

  // Export APIs
  exportToExcel: () => ipcRenderer.invoke('export-excel'),
  exportToPDF: () => ipcRenderer.invoke('export-pdf'),

  // Database APIs
  backupDatabase: () => ipcRenderer.invoke('backup-database'),
  restoreDatabase: () => ipcRenderer.invoke('restore-database'),
  chooseDatabase: () => ipcRenderer.invoke('choose-database'),
  getDbPath: () => ipcRenderer.invoke('get-db-path'),
  resetDbPath: () => ipcRenderer.invoke('reset-db-path'),

  // Budget APIs
  setBudget: (category, limit, month, alertThreshold) => ipcRenderer.invoke('set-budget', category, limit, month, alertThreshold),
  getBudgets: (month) => ipcRenderer.invoke('get-budgets', month),
  getBudgetStatus: (month) => ipcRenderer.invoke('get-budget-status', month),
  deleteBudget: (category, month) => ipcRenderer.invoke('delete-budget', category, month)
});