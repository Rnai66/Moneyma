import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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

  const datePart = new Date().toISOString().split('T')[0];
  const filename = `finance_export_${datePart}.xlsx`;

  try {
    if (Capacitor.isNativePlatform()) {
      const b64Data = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      const result = await Filesystem.writeFile({
        path: filename,
        data: b64Data,
        directory: Directory.Cache
      });
      
      await Share.share({ url: result.uri, title: 'Export Excel' });
      return { success: true, filename, message: 'Export opened in Share sheet' };
    }
  } catch (err) {
    console.log('Mobile share failed, falling back to blob', err);
  }

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
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
  const dataString = JSON.stringify(payload, null, 2);

  try {
    if (Capacitor.isNativePlatform()) {
      const result = await Filesystem.writeFile({
        path: filename,
        data: dataString,
        directory: Directory.Cache,
        encoding: Encoding.UTF8
      });
      await Share.share({ url: result.uri, title: 'Backup JSON' });
      return { success: true, filename, message: `Backup opened in Share sheet` };
    }
  } catch (err) {
    console.log('Capacitor native export unavailable, falling back to browser api', err);
  }

  return saveBlob(
    new Blob([dataString], {
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

  const raw = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
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

// ─── Text / Notepad Export ───────────────────────────────────────────────────

function padR(str, len) { return String(str ?? '').padEnd(len).slice(0, len); }
function padL(str, len) { return String(str ?? '').padStart(len).slice(-len); }
function fmtThb(v) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
}

export async function exportTransactionsToTextBrowser(transactions = [], periodLabel = '') {
  const items = Array.isArray(transactions) ? transactions : [];
  if (items.length === 0) {
    return { success: false, message: 'No transactions to export' };
  }

  const sorted = [...items].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  let totalIncome = 0, totalExpense = 0;
  sorted.forEach(tx => {
    if (tx.type === 'income') totalIncome += Number(tx.amount) || 0;
    else totalExpense += Number(tx.amount) || 0;
  });
  const balance = totalIncome - totalExpense;

  const LINE = '='.repeat(80);
  const DASH = '-'.repeat(80);
  const genDate = new Date().toLocaleString('th-TH', { dateStyle: 'full', timeStyle: 'short' });

  const lines = [];
  lines.push(LINE);
  lines.push(padR('  MoneyMa — รายงานธุรกรรม', 80));
  if (periodLabel) lines.push(padR(`  ช่วงเวลา : ${periodLabel}`, 80));
  lines.push(padR(`  สร้างเมื่อ : ${genDate}`, 80));
  lines.push(LINE);
  lines.push('');
  lines.push('  สรุปภาพรวม');
  lines.push(DASH);
  lines.push(`  รายรับรวม  : ${padL(fmtThb(totalIncome) + ' ฿', 18)}`);
  lines.push(`  รายจ่ายรวม : ${padL(fmtThb(totalExpense) + ' ฿', 18)}`);
  lines.push(`  ยอดสุทธิ   : ${padL(fmtThb(balance) + ' ฿', 18)}${ balance < 0 ? '  ⚠ ติดลบ' : '' }`);
  lines.push(`  จำนวนรายการ: ${items.length}`);
  lines.push('');
  lines.push(LINE);
  lines.push('  รายการธุรกรรม');
  lines.push(LINE);
  // header row
  lines.push(
    padR('  วันที่', 14) +
    padR('ประเภท', 10) +
    padR('หมวดหมู่', 18) +
    padR('รายละเอียด', 26) +
    padL('จำนวนเงิน (฿)', 14)
  );
  lines.push(DASH);

  let lastDate = '';
  sorted.forEach(tx => {
    if (tx.date !== lastDate) { lastDate = tx.date; }
    const typeLabel = tx.type === 'income' ? '  รายรับ' : '  รายจ่าย';
    const amtStr = (tx.type === 'income' ? '+' : '-') + fmtThb(tx.amount);
    lines.push(
      padR('  ' + (tx.date || '—'), 14) +
      padR(typeLabel, 10) +
      padR(tx.category || '—', 18) +
      padR(tx.description || tx.note || '—', 26) +
      padL(amtStr, 14)
    );
  });

  lines.push(DASH);
  lines.push(
    padR('  รวม', 42) +
    padR('', 26) +
    padL(fmtThb(balance), 14)
  );
  lines.push(LINE);
  lines.push('');
  lines.push('  MoneyMa — Personal Finance Manager');
  lines.push('');

  const content = lines.join('\n');
  const datePart = new Date().toISOString().split('T')[0];
  const filename = `finance_report_${datePart}.txt`;
  const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
  // \uFEFF = BOM so Windows Notepad reads Thai correctly

  try {
    if (Capacitor.isNativePlatform()) {
      const result = await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ url: result.uri, title: 'Export Text Report' });
      return { success: true, filename, message: 'Export opened in Share sheet' };
    }
  } catch (err) {
    console.log('Mobile share failed, falling back to blob', err);
  }

  return saveBlob(blob, filename, 'Export transactions as text');
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

export async function exportTransactionsToCsvBrowser(transactions = []) {
  const items = Array.isArray(transactions) ? transactions : [];
  if (items.length === 0) {
    return { success: false, message: 'No transactions to export' };
  }

  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const headers = ['วันที่', 'ประเภท', 'หมวดหมู่', 'รายละเอียด', 'จำนวนเงิน'];
  const rows = items.map(tx => [
    escape(tx.date || ''),
    escape(tx.type === 'income' ? 'รายรับ' : 'รายจ่าย'),
    escape(tx.category || ''),
    escape(tx.description || tx.note || ''),
    escape(Number(tx.amount) || 0),
  ].join(','));

  const content = [headers.join(','), ...rows].join('\n');
  const datePart = new Date().toISOString().split('T')[0];
  const filename = `finance_export_${datePart}.csv`;
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });

  try {
    if (Capacitor.isNativePlatform()) {
      const result = await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ url: result.uri, title: 'Export CSV' });
      return { success: true, filename, message: 'Export opened in Share sheet' };
    }
  } catch (err) {
    console.log('Mobile share failed, falling back to blob', err);
  }

  return saveBlob(blob, filename, 'Export transactions as CSV');
}
