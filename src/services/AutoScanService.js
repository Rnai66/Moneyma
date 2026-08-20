import { extractSlipFromImage, compressImage, fileToBase64 } from './GeminiService';

const SCANNED_HASHES_KEY = 'allslip_scanned_hashes';

// ─── Hash helpers ───────────────────────────────────────────────────────────

async function sha256(base64) {
  const bytes = Uint8Array.from(atob(base64.slice(0, 2048)), (c) => c.charCodeAt(0));
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getScannedHashes() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SCANNED_HASHES_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveScannedHash(hash) {
  const hashes = getScannedHashes();
  hashes.add(hash);
  // Keep only last 500 hashes
  const arr = [...hashes].slice(-500);
  localStorage.setItem(SCANNED_HASHES_KEY, JSON.stringify(arr));
}

export function clearScannedHashes() {
  localStorage.removeItem(SCANNED_HASHES_KEY);
}

// ─── Category → PFM category mapping ────────────────────────────────────────

const CATEGORY_MAP = {
  'อาหาร': 'Food',
  'เดินทาง': 'Transport',
  'ช้อปปิ้ง': 'Shopping',
  'บิลค่าไฟน้ำ': 'Bills',
  'โอนให้เพื่อน': 'Transfer',
  'อื่นๆ': 'Other',
};

export function mapCategory(geminiCategory) {
  return CATEGORY_MAP[geminiCategory] || 'Other';
}

/**
 * Normalize a Gemini slip result into a PFM transaction object ready for the form.
 */
export function normalizeSlipToTransaction(slip) {
  return {
    type: 'expense',
    amount: slip.amount ?? '',
    currency: slip.currency || 'THB',
    category: mapCategory(slip.category),
    date: slip.date || new Date().toISOString().split('T')[0],
    // Rich slip details
    payment_type: slip.payment_type || null,
    status: slip.status || null,
    time: slip.time || null,
    bank_name: slip.bank_name || null,
    receiver_bank: slip.receiver_bank || null,
    sender_name: slip.sender_name || null,
    sender_account: slip.sender_account || null,
    receiver_name: slip.receiver_name || null,
    receiver_account: slip.receiver_account || null,
    ref_id: slip.ref_id || null,
    ref_id2: slip.ref_id2 || null,
    address: slip.address || null,
    sub_items: Array.isArray(slip.sub_items) ? slip.sub_items : [],
    note: [
      slip.note,
    ].filter(Boolean).join(' · '),
  };
}

// ─── Single image scan ───────────────────────────────────────────────────────

/**
 * Scan a single File/Blob from camera or picker.
 */
export async function scanSingleFile(file) {
  const compressed = await compressImage(file);
  const { base64, mimeType } = await fileToBase64(compressed);
  const hash = await sha256(base64);

  const scanned = getScannedHashes();
  const isDuplicate = scanned.has(hash);

  const slip = await extractSlipFromImage(base64, mimeType);
  if (slip.is_slip) saveScannedHash(hash);

  return { slip, hash, isDuplicate };
}

// ─── Batch auto-scan ─────────────────────────────────────────────────────────

/**
 * Batch-scan a list of File objects from the gallery.
 * Calls onProgress({current, total, lastResult}) after each image.
 *
 * @param {File[]} files
 * @param {{ onProgress?: Function, signal?: AbortSignal }} options
 * @returns {Promise<{results: object[], skipped: number, errors: number}>}
 */
export async function batchScanFiles(files, { onProgress, signal } = {}) {
  const results = [];
  let skipped = 0;
  let errors = 0;
  const scanned = getScannedHashes();

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) break;

    try {
      const compressed = await compressImage(files[i]);
      const { base64, mimeType } = await fileToBase64(compressed);
      const hash = await sha256(base64);

      if (scanned.has(hash)) {
        skipped++;
        onProgress?.({ current: i + 1, total: files.length, skipped, errors, lastResult: null });
        continue;
      }

      const slip = await extractSlipFromImage(base64, mimeType);

      if (slip.is_slip) {
        saveScannedHash(hash);
        const transaction = normalizeSlipToTransaction(slip);
        results.push({ slip, transaction, hash, file: files[i] });
        onProgress?.({ current: i + 1, total: files.length, skipped, errors, lastResult: transaction });
      } else {
        skipped++;
        onProgress?.({ current: i + 1, total: files.length, skipped, errors, lastResult: null });
      }
    } catch (err) {
      errors++;
      console.error(`Scan error on file ${i}:`, err);
      onProgress?.({ current: i + 1, total: files.length, skipped, errors, lastResult: null });
    }

    // Fast delay for Pay-as-you-go API (supports 2000 RPM)
    if (i < files.length - 1) await new Promise((r) => setTimeout(r, 400));
  }

  return { results, skipped, errors };
}
