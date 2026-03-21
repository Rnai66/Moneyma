import * as XLSX from 'xlsx';

const WEB_TRANSACTIONS_KEY = 'webTransactions';
const WEB_BUDGETS_KEY = 'webBudgets';
const DARK_MODE_KEY = 'darkMode';
const LANGUAGE_KEY = 'language';

function readJsonFromLocalStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Error reading "${key}" from localStorage:`, error);
    return fallback;
  }
}

function saveBlob(blob, filename, shareTitle) {
  const file = typeof File !== 'undefined'
    ? new File([blob], filename, { type: blob.type || 'application/octet-stream' })
    : null;

  if (
    file &&
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] }) &&
    typeof navigator.share === 'function'
  ) {
    return navigator.share({
      title: shareTitle,
      files: [file],
    }).then(() => ({ success: true, filename, shared: true }));
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return Promise.resolve({ success: true, filename, shared: false });
}

export function getLocalTransactions() {
  return readJsonFromLocalStorage(WEB_TRANSACTIONS_KEY, []);
}

export function getLocalBudgets() {
  return readJsonFromLocalStorage(WEB_BUDGETS_KEY, []);
}

export function getLocalAppData() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions: getLocalTransactions(),
    budgets: getLocalBudgets(),
    preferences: {
      darkMode: readJsonFromLocalStorage(DARK_MODE_KEY, false),
      language: localStorage.getItem(LANGUAGE_KEY) || 'th',
    },
  };
}

export async function exportTransactionsToExcelBrowser(transactions = []) {
  const items = Array.isArray(transactions) ? transactions : [];
  if (items.length === 0) {
    return { success: false, message: 'No transactions to export' };
  }

  const rows = items.map((tx) => ({
    Date: tx.date || '',
    Category: tx.category || '',
    Description: tx.description || '',
    Type: tx.type || '',
    Amount: Number(tx.amount) || 0,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const datePart = new Date().toISOString().split('T')[0];
  const filename = `finance_export_${datePart}.xlsx`;

  return saveBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
    'Export transactions'
  );
}

export async function backupLocalDataBrowser() {
  const payload = getLocalAppData();
  const datePart = new Date().toISOString().split('T')[0];
  const filename = `finance_backup_${datePart}.json`;

  return saveBlob(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    }),
    filename,
    'Backup finance data'
  );
}

export async function restoreLocalBackupFile(file) {
  if (!file) {
    return { success: false, message: 'No file selected' };
  }

  const raw = await file.text();
  const parsed = JSON.parse(raw);

  if (!parsed || !Array.isArray(parsed.transactions)) {
    throw new Error('Invalid backup file');
  }

  localStorage.setItem(WEB_TRANSACTIONS_KEY, JSON.stringify(parsed.transactions));
  localStorage.setItem(WEB_BUDGETS_KEY, JSON.stringify(Array.isArray(parsed.budgets) ? parsed.budgets : []));

  if (typeof parsed.preferences?.darkMode === 'boolean') {
    localStorage.setItem(DARK_MODE_KEY, JSON.stringify(parsed.preferences.darkMode));
  }

  if (typeof parsed.preferences?.language === 'string') {
    localStorage.setItem(LANGUAGE_KEY, parsed.preferences.language);
  }

  return {
    success: true,
    message: 'Data restored successfully',
    transactions: parsed.transactions.length,
  };
}
