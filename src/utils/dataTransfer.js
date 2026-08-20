import { tr } from '../i18n/lang';
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
  const t = tr();
  const genDate = new Date().toLocaleString(t.localeTag, { dateStyle: 'full', timeStyle: 'short' });

  const lines = [];
  lines.push(LINE);
  lines.push(padR(`  ${t.expReportTitle}`, 80));
  if (periodLabel) lines.push(padR(`  ${padR(t.expPeriod, 12)}: ${periodLabel}`, 80));
  lines.push(padR(`  ${padR(t.expGenerated, 12)}: ${genDate}`, 80));
  lines.push(LINE);
  lines.push('');
  lines.push(`  ${t.expOverview}`);
  lines.push(DASH);
  lines.push(`  ${padR(t.expTotalIncome, 13)}: ${padL(fmtThb(totalIncome) + ' ฿', 18)}`);
  lines.push(`  ${padR(t.expTotalExpense, 13)}: ${padL(fmtThb(totalExpense) + ' ฿', 18)}`);
  lines.push(`  ${padR(t.expNet, 13)}: ${padL(fmtThb(balance) + ' ฿', 18)}${ balance < 0 ? `  ⚠ ${t.expNegative}` : '' }`);
  lines.push(`  ${padR(t.expCount, 13)}: ${items.length}`);
  lines.push('');
  lines.push(LINE);
  lines.push(`  ${t.expTransactions}`);
  lines.push(LINE);
  // header row
  lines.push(
    padR(`  ${t.expColDate}`, 14) +
    padR(t.expColType, 10) +
    padR(t.expColCategory, 18) +
    padR(t.expColDescription, 26) +
    padL(`${t.expColAmount} (฿)`, 14)
  );
  lines.push(DASH);

  let lastDate = '';
  sorted.forEach(tx => {
    if (tx.date !== lastDate) { lastDate = tx.date; }
    const typeLabel = '  ' + (tx.type === 'income' ? t.expIncome : t.expExpense);
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
    padR(`  ${t.expTotal}`, 42) +
    padR('', 26) +
    padL(fmtThb(balance), 14)
  );
  lines.push(LINE);
  lines.push('');
  lines.push(`  MoneyMa — ${t.appTagline}`);
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

  const t = tr();
  const headers = [t.expColDate, t.expColType, t.expColCategory, t.expColDescription, t.expColAmount];
  const rows = items.map(tx => [
    escape(tx.date || ''),
    escape(tx.type === 'income' ? t.expIncome : t.expExpense),
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

// ─── Business Statement & Printable PDF Export ───────────────────────────────

export async function exportTransactionsToStatementPDF(transactions = [], options = {}) {
  const {
    title = 'สเตทเมนต์ทางการเงิน / Financial Statement',
    companyName = 'MoneyMa Business',
    taxId = '',
    address = '',
    phone = '',
    note = 'เอกสารนี้สร้างขึ้นโดยอัตโนมัติจากระบบ MoneyMa',
    selectedColumns = ['date', 'type', 'category', 'description', 'amount', 'balance'],
    startDate = '',
    endDate = '',
  } = options;

  const items = Array.isArray(transactions) ? transactions : [];
  if (items.length === 0) {
    return { success: false, message: 'No transactions to export' };
  }

  let filtered = [...items];
  if (startDate) filtered = filtered.filter(tx => (tx.date || '') >= startDate);
  if (endDate) filtered = filtered.filter(tx => (tx.date || '') <= endDate);

  filtered.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  let runningBalance = 0;
  let totalIncome = 0;
  let totalExpense = 0;

  const processedRows = filtered.map((tx) => {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income') {
      totalIncome += amt;
      runningBalance += amt;
    } else {
      totalExpense += amt;
      runningBalance -= amt;
    }
    return {
      ...tx,
      runningBalance,
    };
  });

  const netBalance = totalIncome - totalExpense;
  const genDate = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap');
        body { font-family: 'Sarabun', sans-serif; color: #1e293b; padding: 30px; margin: 0; background: #fff; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 25px; }
        .company-info h1 { margin: 0 0 6px 0; font-size: 24px; color: #4338ca; font-weight: 700; }
        .company-info p { margin: 2px 0; font-size: 13px; color: #64748b; }
        .doc-title { text-align: right; }
        .doc-title h2 { margin: 0; font-size: 20px; color: #0f172a; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .doc-title p { margin: 4px 0 0 0; font-size: 12px; color: #64748b; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; background: #f8fafc; padding: 18px; border-radius: 12px; border: 1px solid #e2e8f0; }
        .summary-item { text-align: center; }
        .summary-item .label { font-size: 12px; color: #64748b; font-weight: 500; }
        .summary-item .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
        .income { color: #16a34a; }
        .expense { color: #dc2626; }
        .balance { color: #4338ca; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px; }
        th { background: #4338ca; color: #ffffff; font-weight: 600; padding: 10px 12px; text-align: left; }
        td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) { background: #f8fafc; }
        .text-right { text-align: right; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
        .badge-income { background: #dcfce7; color: #15803d; }
        .badge-expense { background: #fee2e2; color: #b91c1c; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; display: flex; justify-content: space-between; align-items: center; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-info">
          <h1>${companyName}</h1>
          ${taxId ? `<p>เลขประจำตัวผู้เสียภาษี / Tax ID: ${taxId}</p>` : ''}
          ${address ? `<p>${address}</p>` : ''}
          ${phone ? `<p>โทร / Tel: ${phone}</p>` : ''}
        </div>
        <div class="doc-title">
          <h2>${title}</h2>
          <p>วันที่พิมพ์: ${genDate}</p>
          ${startDate || endDate ? `<p>ช่วงเวลา: ${startDate || 'เริ่มต้น'} ถึง ${endDate || 'ปัจจุบัน'}</p>` : ''}
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-item">
          <div class="label">รายรับรวม (Total Income)</div>
          <div class="value income">+฿${totalIncome.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="summary-item">
          <div class="label">รายจ่ายรวม (Total Expense)</div>
          <div class="value expense">-฿${totalExpense.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="summary-item">
          <div class="label">ยอดคงเหลือสุทธิ (Net Balance)</div>
          <div class="value balance">฿${netBalance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="summary-item">
          <div class="label">จำนวนรายการ (Transactions)</div>
          <div class="value">${processedRows.length} รายการ</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            ${selectedColumns.includes('date') ? '<th>วันที่ (Date)</th>' : ''}
            ${selectedColumns.includes('type') ? '<th>ประเภท (Type)</th>' : ''}
            ${selectedColumns.includes('category') ? '<th>หมวดหมู่ (Category)</th>' : ''}
            ${selectedColumns.includes('description') ? '<th>รายการ (Description)</th>' : ''}
            ${selectedColumns.includes('amount') ? '<th class="text-right">จำนวนเงิน (Amount)</th>' : ''}
            ${selectedColumns.includes('balance') ? '<th class="text-right">ยอดคงเหลือสะสม (Balance)</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${processedRows.map(row => `
            <tr>
              ${selectedColumns.includes('date') ? `<td>${row.date || '—'}</td>` : ''}
              ${selectedColumns.includes('type') ? `<td><span class="badge ${row.type === 'income' ? 'badge-income' : 'badge-expense'}">${row.type === 'income' ? 'รายรับ' : 'รายจ่าย'}</span></td>` : ''}
              ${selectedColumns.includes('category') ? `<td>${row.category || '—'}</td>` : ''}
              ${selectedColumns.includes('description') ? `<td>${row.description || row.note || '—'}</td>` : ''}
              ${selectedColumns.includes('amount') ? `<td class="text-right ${row.type === 'income' ? 'income' : 'expense'}" style="font-weight:600;">${row.type === 'income' ? '+' : '-'}฿${(Number(row.amount) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>` : ''}
              ${selectedColumns.includes('balance') ? `<td class="text-right" style="font-weight:600; color:#4338ca;">฿${row.runningBalance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${note ? `<p style="font-size:12px; color:#64748b; font-style:italic;">* ${note}</p>` : ''}

      <div class="footer">
        <div>MoneyMa Financial System — รายงานการเงินระดับมืออาชีพ</div>
        <div>หน้า 1 / 1</div>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
    return { success: true, message: 'Opened print dialog' };
  } else {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    return saveBlob(blob, `statement_${new Date().toISOString().split('T')[0]}.html`, 'Business Statement');
  }
}

// ─── Inventory & POS Periodic Report Export ──────────────────────────────────

export async function exportInventoryPOSReport(reportData = {}) {
  const {
    title = 'รายงานสรุปการซื้อ-ขาย และสต็อกสินค้า (Inventory & POS Report)',
    companyName = 'MoneyMa Store',
    periodLabel = 'ประจำวัน / เดือน / ไตรมาส / ปี',
    products = [],
    totalSales = 0,
    totalPurchases = 0,
    totalStockCostVal = 0,
    totalStockRetailVal = 0,
  } = reportData;

  const grossProfit = totalSales - totalPurchases;
  const genDate = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap');
        body { font-family: 'Sarabun', sans-serif; color: #0f172a; padding: 30px; margin: 0; background: #fff; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 20px; }
        .company-info h1 { margin: 0 0 4px 0; font-size: 24px; color: #047857; font-weight: 700; }
        .company-info p { margin: 0; font-size: 13px; color: #64748b; }
        .doc-title { text-align: right; }
        .doc-title h2 { margin: 0; font-size: 18px; color: #0f172a; font-weight: 700; }
        .doc-title p { margin: 2px 0 0 0; font-size: 12px; color: #64748b; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; background: #f0fdf4; padding: 16px; border-radius: 12px; border: 1px solid #a7f3d0; }
        .summary-item { text-align: center; }
        .summary-item .label { font-size: 11px; color: #047857; font-weight: 600; text-transform: uppercase; }
        .summary-item .value { font-size: 17px; font-weight: 800; margin-top: 4px; }
        .sales { color: #059669; }
        .purchase { color: #dc2626; }
        .profit { color: #2563eb; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
        th { background: #047857; color: #ffffff; font-weight: 600; padding: 8px 10px; text-align: left; }
        td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) { background: #f8fafc; }
        .text-right { text-align: right; }
        .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-info">
          <h1>${companyName}</h1>
          <p>ระบบบริหารจัดการคลังสินค้าและออกบิล POS (MoneyMa Business)</p>
        </div>
        <div class="doc-title">
          <h2>${title}</h2>
          <p>ช่วงเวลา: <b>${periodLabel}</b></p>
          <p>พิมพ์เมื่อ: ${genDate}</p>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-item">
          <div class="label">ยอดขายออกรวม (Total Sales)</div>
          <div class="value sales">+฿${totalSales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="summary-item">
          <div class="label">ยอดซื้อเข้ารวม (Purchases)</div>
          <div class="value purchase">-฿${totalPurchases.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="summary-item">
          <div class="label">กำไรขั้นต้น (Gross Profit)</div>
          <div class="value profit">฿${grossProfit.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="summary-item">
          <div class="label">มูลค่าสินค้าในคลัง (Stock Cost / Retail)</div>
          <div class="value">฿${totalStockCostVal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
          <div style="font-size:10px; color:#64748b;">(มูลค่าขาย: ฿${totalStockRetailVal.toLocaleString('th-TH', { minimumFractionDigits: 2 })})</div>
        </div>
      </div>

      <h3 style="font-size:14px; margin-bottom:10px; color:#0f172a;">รายละเอียดสินค้าคงคลังและมูลค่า (Inventory Breakdown)</h3>
      <table>
        <thead>
          <tr>
            <th>รหัส SKU</th>
            <th>ชื่อสินค้า</th>
            <th>หมวดหมู่</th>
            <th className="text-right">ราคาทุน (฿)</th>
            <th className="text-right">ราคาขาย (฿)</th>
            <th className="text-right">คงเหลือ</th>
            <th className="text-right">มูลค่าทุนรวม (฿)</th>
            <th className="text-right">มูลค่าขายรวม (฿)</th>
          </tr>
        </thead>
        <tbody>
          ${products.map(prod => `
            <tr>
              <td><code>${prod.sku}</code></td>
              <td><b>${prod.name}</b></td>
              <td>${prod.category}</td>
              <td class="text-right">฿${(Number(prod.cost) || 0).toLocaleString()}</td>
              <td class="text-right">฿${(Number(prod.price) || 0).toLocaleString()}</td>
              <td class="text-right" style="font-weight:bold; color:${prod.stock <= prod.minStock ? '#dc2626' : '#059669'};">${prod.stock}</td>
              <td class="text-right">฿${((Number(prod.stock) || 0) * (Number(prod.cost) || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
              <td class="text-right" style="font-weight:bold; color:#047857;">฿${((Number(prod.stock) || 0) * (Number(prod.price) || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer">
        <div>MoneyMa POS & Inventory Management System</div>
        <div>เอกสารออกโดยอัตโนมัติ</div>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
    return { success: true, message: 'Opened print dialog' };
  } else {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    return saveBlob(blob, `inventory_report_${new Date().toISOString().split('T')[0]}.html`, 'Inventory Report');
  }
}


