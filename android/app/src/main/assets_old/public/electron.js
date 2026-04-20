const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');

// Resolve DatabaseService path for both dev and packaged (asar) builds.
// In dev: electron.js is served from public/, app root is project root → src/database/...
// In prod: electron.js is in build/ inside app.asar, app root = asar root → src/database/...
const DatabaseService = require(path.join(app.getAppPath(), 'src', 'database', 'JsonDatabaseService'));

const xlsx = require('xlsx');
const fs = require('fs');

// Check if running in development mode - simple check
const isDev = !app.isPackaged;

let mainWindow;
let db;

// ─── Custom DB Path Persistence ───────────────────────────────────────
function getDbPathFile() {
  return path.join(app.getPath('userData'), 'db-path.json');
}

function loadCustomDbPath() {
  try {
    const file = getDbPathFile();
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.customPath && fs.existsSync(data.customPath)) return data.customPath;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function saveCustomDbPath(customPath) {
  fs.writeFileSync(getDbPathFile(), JSON.stringify({ customPath }), 'utf8');
}

function clearCustomDbPath() {
  try { fs.unlinkSync(getDbPathFile()); } catch (e) { /* ignore */ }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'MoneyMa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.on('ready', () => {
  db = new DatabaseService(loadCustomDbPath());
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handlers for Database Operations
ipcMain.handle('get-transactions', async (event, filters) => {
  try {
    return await db.getTransactions(filters);
  } catch (error) {
    console.error('Error getting transactions:', error);
    throw error;
  }
});

ipcMain.handle('add-transaction', async (event, transaction) => {
  try {
    return await db.addTransaction(transaction);
  } catch (error) {
    console.error('Error adding transaction:', error);
    throw error;
  }
});

ipcMain.handle('update-transaction', async (event, id, transaction) => {
  try {
    return await db.updateTransaction(id, transaction);
  } catch (error) {
    console.error('Error updating transaction:', error);
    throw error;
  }
});

ipcMain.handle('delete-transaction', async (event, id) => {
  try {
    return await db.deleteTransaction(id);
  } catch (error) {
    console.error('Error deleting transaction:', error);
    throw error;
  }
});

ipcMain.handle('save-all-transactions', async (event, transactions) => {
  try {
    return await db.saveAllTransactions(transactions);
  } catch (error) {
    console.error('Error saving all transactions:', error);
    throw error;
  }
});

ipcMain.handle('get-summary', async (event) => {
  try {
    return await db.getSummary();
  } catch (error) {
    console.error('Error getting summary:', error);
    throw error;
  }
});

ipcMain.handle('get-statistics-month', async (event) => {
  try {
    return await db.getStatisticsByMonth();
  } catch (error) {
    console.error('Error getting statistics:', error);
    throw error;
  }
});

ipcMain.handle('get-statistics-category', async (event) => {
  try {
    return await db.getStatisticsByCategory();
  } catch (error) {
    console.error('Error getting statistics:', error);
    throw error;
  }
});

ipcMain.handle('get-categories', async (event, type) => {
  try {
    return await db.getCategories(type);
  } catch (error) {
    console.error('Error getting categories:', error);
    throw error;
  }
});

// Export to Excel
ipcMain.handle('export-excel', async (event) => {
  try {
    // Get all transactions from database
    const transactions = await db.getTransactions({});

    if (!transactions || transactions.length === 0) {
      return { success: false, message: 'No transactions to export' };
    }

    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `finance_export_${new Date().toISOString().split('T')[0]}.xlsx`,
      filters: [
        { name: 'Excel Files', extensions: ['xlsx'] }
      ]
    });

    if (result.canceled) {
      return { success: false };
    }

    // Prepare data for Excel
    const data = transactions.map(trans => ({
      'Date': trans.date,
      'Category': trans.category,
      'Description': trans.description || '',
      'Type': trans.type === 'income' ? 'Income' : 'Expense',
      'Amount': trans.amount
    }));

    // Create workbook
    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Transactions');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 12 },
      { wch: 15 },
      { wch: 25 },
      { wch: 10 },
      { wch: 12 }
    ];

    // Write file
    xlsx.writeFile(workbook, result.filePath);
    console.log('Exported to Excel:', result.filePath);
    return { success: true, path: result.filePath };
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    throw error;
  }
});

// Export to PDF (placeholder - will implement later)
ipcMain.handle('export-pdf', async (event, transactions) => {
  try {
    console.log('Export to PDF: placeholder');
    return { success: false, message: 'PDF export coming soon' };
  } catch (error) {
    console.error('Error exporting:', error);
    throw error;
  }
});

// Backup Database
ipcMain.handle('backup-database', async (event) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `finance_backup_${new Date().toISOString().split('T')[0]}.json`,
      filters: [
        { name: 'Data Files', extensions: ['json'] }
      ]
    });

    if (result.canceled) {
      return { success: false };
    }

    const dbPath = db.dbPath;
    fs.copyFileSync(dbPath, result.filePath);
    console.log('Backed up database:', result.filePath);
    return { success: true, path: result.filePath };
  } catch (error) {
    console.error('Error backing up:', error);
    throw error;
  }
});

// Restore Database
ipcMain.handle('restore-database', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [
        { name: 'Data Files', extensions: ['json'] }
      ]
    });

    if (result.canceled) {
      return { success: false };
    }

    const dbPath = db.dbPath;
    const backupPath = `${dbPath}.backup_${Date.now()}`;

    // Create backup of current database
    fs.copyFileSync(dbPath, backupPath);

    // Restore from selected file
    fs.copyFileSync(result.filePaths[0], dbPath);
    console.log('Restored database from:', result.filePaths[0]);

    return { success: true, message: 'Database restored. Please restart the app.' };
  } catch (error) {
    console.error('Error restoring:', error);
    throw error;
  }
});

// ─── Choose / Get / Reset Database Path ───────────────────────────────
ipcMain.handle('choose-database', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'เลือกไฟล์ฐานข้อมูล',
      filters: [{ name: 'Data Files', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths.length) return { success: false };

    const chosenPath = result.filePaths[0];
    saveCustomDbPath(chosenPath);
    return { success: true, path: chosenPath, requiresRestart: true };
  } catch (error) {
    console.error('Error choosing database:', error);
    throw error;
  }
});

ipcMain.handle('get-db-path', async () => {
  return { path: db.dbPath, isCustom: !!loadCustomDbPath() };
});

ipcMain.handle('reset-db-path', async () => {
  clearCustomDbPath();
  return { success: true, requiresRestart: true };
});

// Budget Handlers
ipcMain.handle('set-budget', async (event, category, limit, month, alertThreshold) => {
  try {
    return await db.setBudget(category, limit, month, alertThreshold);
  } catch (error) {
    console.error('Error setting budget:', error);
    throw error;
  }
});

ipcMain.handle('get-budgets', async (event, month) => {
  try {
    return await db.getBudgets(month);
  } catch (error) {
    console.error('Error getting budgets:', error);
    throw error;
  }
});

ipcMain.handle('get-budget-status', async (event, month) => {
  try {
    return await db.getBudgetStatus(month);
  } catch (error) {
    console.error('Error getting budget status:', error);
    throw error;
  }
});

ipcMain.handle('delete-budget', async (event, category, month) => {
  try {
    return await db.deleteBudget(category, month);
  } catch (error) {
    console.error('Error deleting budget:', error);
    throw error;
  }
});
