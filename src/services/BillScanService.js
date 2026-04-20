/**
 * BillScanService.js
 *
 * Handles scanning of itemized bills/receipts from:
 * 7-Eleven, Prime, NTUC FairPrice, BigC, Makro/Macro,
 * Lotus's, Tops, Villa Market, Gourmet Market,
 * and general supermarkets / convenience stores.
 *
 * Key difference from SlipScan:
 * - Slips  → single transaction (transfer amount)
 * - Bills  → itemized list → save as 1 total OR split by category
 */

import { compressImage, fileToBase64 } from './GeminiService';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// ─── Item-level categories ──────────────────────────────────────────────────
export const ITEM_CATEGORIES = {
  food_fresh: { label: 'อาหารสด', icon: '🥩', pfmCategory: 'Food' },
  food_packaged: { label: 'อาหารสำเร็จ', icon: '🥫', pfmCategory: 'Food' },
  food_snack: { label: 'ขนม/เครื่องดื่ม', icon: '🧃', pfmCategory: 'Food' },
  household: { label: 'ของใช้ในบ้าน', icon: '🧹', pfmCategory: 'Shopping' },
  personal_care: { label: 'ของใช้ส่วนตัว', icon: '🧴', pfmCategory: 'Shopping' },
  health: { label: 'ยา/สุขภาพ', icon: '💊', pfmCategory: 'Shopping' },
  alcohol: { label: 'เครื่องดื่มแอลกอฮอล์', icon: '🍺', pfmCategory: 'Food' },
  other: { label: 'อื่นๆ', icon: '📦', pfmCategory: 'Shopping' },
};

// ─── Known store registry ───────────────────────────────────────────────────
export const STORE_REGISTRY = [
  { match: /7.?eleven|7-11|เซเว่น/i, name: '7-Eleven', type: 'convenience', currency: null },
  { match: /prime\s*super/i, name: 'Prime Supermarket', type: 'supermarket', currency: 'SGD' },
  { match: /ntuc|fairprice/i, name: 'NTUC FairPrice', type: 'supermarket', currency: 'SGD' },
  { match: /big.?c/i, name: 'Big C', type: 'hypermarket', currency: 'THB' },
  { match: /makro|macro/i, name: 'Makro', type: 'wholesale', currency: 'THB' },
  { match: /lotus|tesco/i, name: "Lotus's", type: 'hypermarket', currency: 'THB' },
  { match: /tops\s*market/i, name: 'Tops Market', type: 'supermarket', currency: 'THB' },
  { match: /villa\s*market/i, name: 'Villa Market', type: 'supermarket', currency: 'THB' },
  { match: /gourmet/i, name: 'Gourmet Market', type: 'supermarket', currency: 'THB' },
  { match: /foodland/i, name: 'Foodland', type: 'supermarket', currency: 'THB' },
  { match: /family\s*mart/i, name: 'FamilyMart', type: 'convenience', currency: null },
  { match: /lawson/i, name: 'Lawson', type: 'convenience', currency: null },
  { match: /cold\s*storage/i, name: 'Cold Storage', type: 'supermarket', currency: 'SGD' },
  { match: /giant/i, name: 'Giant', type: 'hypermarket', currency: 'SGD' },
];

export function detectStore(storeName = '') {
  for (const s of STORE_REGISTRY) {
    if (s.match.test(storeName)) return s;
  }
  return { name: storeName, type: 'supermarket', currency: null };
}

// ─── Gemini prompt ──────────────────────────────────────────────────────────

const BILL_SYSTEM_PROMPT = `You are an expert receipt/bill OCR extractor for Southeast Asian supermarkets and convenience stores.

Extract ALL information from the receipt image and respond ONLY with a single raw JSON object.
No markdown, no explanation, no backticks — raw JSON only.

Schema:
{
  "is_receipt": boolean,
  "store_name": "string",
  "store_branch": "string or null",
  "store_address": "string or null",
  "store_phone": "string or null",
  "store_type": "convenience|supermarket|hypermarket|wholesale|restaurant|pharmacy|other",
  "date": "YYYY-MM-DD or null",
  "time": "HH:mm or null",
  "receipt_no": "string or null",
  "cashier": "string or null",
  "currency": "THB|SGD|USD|MYR|...",
  "items": [
    {
      "name": "string",
      "name_clean": "short readable name",
      "qty": number,
      "unit_price": number,
      "discount": number,
      "total": number,
      "category": "food_fresh|food_packaged|food_snack|household|personal_care|health|alcohol|other",
      "is_promo": boolean
    }
  ],
  "discounts_total": number,
  "subtotal": number,
  "tax_rate": "string or null",
  "tax_amount": number,
  "total": number,
  "payment_method": "cash|visa|mastercard|amex|promptpay|qr|other",
  "payment_last4": "string or null",
  "points_earned": number or null,
  "note": "string or null"
}

Item category rules:
- food_fresh: meat, fish, seafood, vegetables, fruit, dairy, eggs
- food_packaged: canned food, instant noodles, sauces, condiments, cooking ingredients  
- food_snack: snacks, chips, candy, chocolate, juice, soft drinks, water
- household: cleaning supplies, paper products, trash bags, laundry
- personal_care: shampoo, soap, toothpaste, lotion, cosmetics
- health: medicine, vitamins, supplements, baby products
- alcohol: beer, wine, spirits, seltzers
- other: everything else

If the image is NOT a receipt, return: {"is_receipt": false}
Handle Thai, English, and mixed-language receipts equally well.
Negative amounts on items = discounts. Extract them separately in the "discount" field.`;

// ─── Gemini call ──────────────────────────────────────────────────────────

export async function extractBillFromImage(base64Image, mimeType = 'image/jpeg') {
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  if (!apiKey) throw new Error('REACT_APP_GEMINI_API_KEY is not set');

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: BILL_SYSTEM_PROMPT }] },
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: 'Extract all items and totals from this receipt.' },
        ],
      }],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.05,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    let msg = err?.error?.message || `Gemini API error ${response.status}`;
    if (response.status === 429 || msg.includes('Resource exhausted') || msg.includes('429')) {
      msg = 'โควต้าใช้งาน AI เต็มชั่วคราว กรุณารอสักครู่แล้วลองใหม่อีกครั้ง';
    }
    throw new Error(msg);
  }

  const data = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('Empty response from Gemini');

  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (err) {
    console.error('Failed to parse Gemini raw response:', raw);
    throw new Error('Failed to parse Gemini receipt response. Please check console for raw output.');
  }
}

// ─── Scan a file ─────────────────────────────────────────────────────────────

export async function scanBillFile(file) {
  // For tall receipts, use higher max-width to capture all text
  const compressed = await compressImage(file, 1200, 0.9);
  const { base64, mimeType } = await fileToBase64(compressed);
  const bill = await extractBillFromImage(base64, mimeType);
  return bill;
}

// ─── Normalize to transaction(s) ─────────────────────────────────────────────

/**
 * Convert a bill into a SINGLE summary transaction.
 */
export function billToSingleTransaction(bill) {
  const store = detectStore(bill.store_name);
  const rawAmount = bill.total ?? bill.subtotal ?? 0;
  return {
    type: rawAmount < 0 ? 'income' : 'expense',
    amount: Math.abs(rawAmount),
    currency: bill.currency || store.currency || 'THB',
    category: 'Shopping',
    date: bill.date || new Date().toISOString().split('T')[0],
    note: [
      bill.store_name,
      bill.store_branch,
      bill.receipt_no ? `#${bill.receipt_no}` : null,
      bill.payment_method ? `จ่ายด้วย ${bill.payment_method}${bill.payment_last4 ? ` (${bill.payment_last4})` : ''}` : null,
      bill.items?.length ? `${bill.items.length} รายการ` : null,
    ].filter(Boolean).join(' · '),
    _sourceType: 'bill',
    _storeName: bill.store_name,
    _receiptNo: bill.receipt_no,
  };
}

/**
 * Convert a bill into MULTIPLE transactions — one per PFM category.
 * e.g. Food = ฿320, Shopping = ฿85
 */
export function billToCategoryTransactions(bill) {
  const store = detectStore(bill.store_name);
  const currency = bill.currency || store.currency || 'THB';
  const date = bill.date || new Date().toISOString().split('T')[0];
  const baseNote = [bill.store_name, bill.store_branch].filter(Boolean).join(' ');

  // Group items by pfmCategory
  const groups = {};
  for (const item of (bill.items ?? [])) {
    const catInfo = ITEM_CATEGORIES[item.category] ?? ITEM_CATEGORIES.other;
    const pfm = catInfo.pfmCategory;
    if (!groups[pfm]) groups[pfm] = { total: 0, items: [] };
    groups[pfm].total += item.total ?? 0;
    groups[pfm].items.push(item.name_clean ?? item.name);
  }

  // Distribute tax proportionally
  const taxAmount = bill.tax_amount ?? 0;
  const subtotal = bill.subtotal ?? (bill.total - taxAmount);

  return Object.entries(groups)
    .map(([pfmCat, g]) => {
      const proportion = subtotal > 0 ? g.total / subtotal : 0;
      const taxShare = Math.round(taxAmount * proportion * 100) / 100;
      const rawAmount = Math.round((g.total + taxShare) * 100) / 100;
      return {
        type: rawAmount < 0 ? 'income' : 'expense',
        amount: Math.abs(rawAmount),
        currency,
        category: pfmCat,
        date,
        note: `${baseNote} · ${g.items.slice(0, 3).join(', ')}${g.items.length > 3 ? ` +${g.items.length - 3}` : ''}`,
        _sourceType: 'bill',
        _storeName: bill.store_name,
        _receiptNo: bill.receipt_no,
      };
    })
    .filter(tx => tx.amount > 0); // Drop exact 0 amounts
}

/**
 * Convert each item into its own transaction (most granular).
 */
export function billToItemTransactions(bill) {
  const store = detectStore(bill.store_name);
  const currency = bill.currency || store.currency || 'THB';
  const date = bill.date || new Date().toISOString().split('T')[0];

  return (bill.items ?? [])
    .filter(item => (item.total ?? 0) !== 0) // Drop items with 0 total
    .map((item) => {
      const catInfo = ITEM_CATEGORIES[item.category] ?? ITEM_CATEGORIES.other;
      const itemAmt = item.total ?? 0;
      return {
        type: itemAmt < 0 ? 'income' : 'expense',
        amount: Math.abs(itemAmt),
        currency,
        category: catInfo.pfmCategory,
        date,
        note: `${bill.store_name} · ${item.name_clean ?? item.name}${item.qty > 1 ? ` ×${item.qty}` : ''}`,
      _sourceType: 'bill_item',
      _storeName: bill.store_name,
      _receiptNo: bill.receipt_no,
      _itemCategory: item.category,
    };
  });
}
