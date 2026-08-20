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
import { tr } from '../i18n/lang';
import { checkAiLimit, incrementAiUsage } from './AiUsageService';

// Use Gemini 2.5 Flash explicitly — gemini-flash-latest may resolve to an older version
// Gemini 2.5 Flash has much larger output capacity and better vision OCR
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ─── Item-level categories ──────────────────────────────────────────────────
export const ITEM_CATEGORIES = {
  food_fresh: { labelKey: 'catFoodFresh', icon: '🥩', pfmCategory: 'Food' },
  food_packaged: { labelKey: 'catFoodPackaged', icon: '🥫', pfmCategory: 'Food' },
  food_snack: { labelKey: 'catFoodSnack', icon: '🧃', pfmCategory: 'Food' },
  household: { labelKey: 'catHousehold', icon: '🧹', pfmCategory: 'Shopping' },
  personal_care: { labelKey: 'catPersonalCare', icon: '🧴', pfmCategory: 'Shopping' },
  health: { labelKey: 'catHealth', icon: '💊', pfmCategory: 'Shopping' },
  alcohol: { labelKey: 'catAlcohol', icon: '🍺', pfmCategory: 'Food' },
  other: { labelKey: 'catOther', icon: '📦', pfmCategory: 'Shopping' },
};

// ─── Known store registry ───────────────────────────────────────────────────
export const STORE_REGISTRY = [
  { match: /7.?eleven|7-11|เซเว่น/i, name: '7-Eleven', type: 'convenience', currency: null },
  { match: /prime\s*super/i, name: 'Prime Supermarket', type: 'supermarket', currency: 'SGD' },
  { match: /ntuc|fairprice/i, name: 'NTUC FairPrice', type: 'supermarket', currency: 'SGD' },
  { match: /big.?c/i, name: 'Big C', type: 'hypermarket', currency: 'THB' },
  { match: /makro|macro/i, name: 'Makro', type: 'wholesale', currency: 'THB' },
  { match: /lotus|tesco/i, name: "Lotus's", type: 'hypermarket', currency: 'THB' },
  { match: /tops\s*(market|daily|food)/i, name: 'Tops', type: 'supermarket', currency: 'THB' },
  { match: /villa\s*market/i, name: 'Villa Market', type: 'supermarket', currency: 'THB' },
  { match: /gourmet/i, name: 'Gourmet Market', type: 'supermarket', currency: 'THB' },
  { match: /foodland/i, name: 'Foodland', type: 'supermarket', currency: 'THB' },
  { match: /family\s*mart/i, name: 'FamilyMart', type: 'convenience', currency: null },
  { match: /lawson/i, name: 'Lawson', type: 'convenience', currency: null },
  { match: /cold\s*storage/i, name: 'Cold Storage', type: 'supermarket', currency: 'SGD' },
  { match: /giant/i, name: 'Giant', type: 'hypermarket', currency: 'SGD' },
  { match: /ptt|or\s*station|จิฟฟี่|jiffy/i, name: 'PTT Station', type: 'fuel', currency: 'THB' },
  { match: /shell|เชลล์/i, name: 'Shell', type: 'fuel', currency: 'THB' },
  { match: /bangchak|บางจาก/i, name: 'Bangchak', type: 'fuel', currency: 'THB' },
  { match: /caltex/i, name: 'Caltex', type: 'fuel', currency: 'THB' },
  { match: /cj\s*more|cj\s*express/i, name: 'CJ More', type: 'convenience', currency: 'THB' },
];

export function detectStore(storeName = '') {
  for (const s of STORE_REGISTRY) {
    if (s.match.test(storeName)) return s;
  }
  return { name: storeName, type: 'supermarket', currency: null };
}

// ─── Gemini prompt ──────────────────────────────────────────────────────────

const BILL_SYSTEM_PROMPT = `You are an expert receipt/bill OCR extractor for all types of merchants (supermarkets, convenience stores, restaurants, pharmacies, gas stations, and general retail).

Extract ALL information from the receipt image and respond ONLY with a single raw JSON object.
No markdown, no explanation, no backticks — raw JSON only.

Schema:
{
  "is_receipt": boolean,
  "store_name": "string",
  "store_branch": "string or null",
  "store_address": "string or null",
  "store_phone": "string or null",
  "store_type": "convenience|supermarket|hypermarket|wholesale|restaurant|pharmacy|fuel|other",
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
- food_snack: snacks, chips, candy, chocolate, juice, soft drinks, water, prepared restaurant food
- household: cleaning supplies, paper products, trash bags, laundry
- personal_care: shampoo, soap, toothpaste, lotion, cosmetics
- health: medicine, vitamins, supplements, baby products
- alcohol: beer, wine, spirits, seltzers
- other: electronics, clothing, fuel, services, everything else

If the image is NOT a receipt, return: {"is_receipt": false}
Handle Thai, English, and mixed-language receipts equally well.
Negative amounts on items = discounts. Extract them separately in the "discount" field.

IMPORTANT: If you see sensitive personal data like full credit card numbers or IDs, simply OMIT them or mask them in the "note" field. Do not refuse to answer. Respond ONLY with JSON.`;

// ─── Partial JSON repair ──────────────────────────────────────────────────
/**
 * Attempts to salvage a truncated JSON string produced when Gemini hits MAX_TOKENS.
 * Strategy:
 *  1. Try to parse as-is (works if truncation happened after a closing brace).
 *  2. Close any open arrays/objects by tracking bracket depth.
 *  3. Return null if the result is not usable (no items at all).
 */
function repairPartialBillJson(raw) {
  if (!raw) return null;

  // Find the start of the JSON object
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) return null;
  let partial = raw.substring(jsonStart);

  // Step 1: try direct parse first
  try { return JSON.parse(partial); } catch (_) { /* expected */ }

  // Step 2: close unclosed brackets/braces
  // Walk through and track open structures, then close them in reverse
  const stack = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < partial.length; i++) {
    const ch = partial[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') { stack.push(ch); }
    else if (ch === '}' || ch === ']') { stack.pop(); }
  }

  // Remove trailing comma/incomplete token before closing
  let repaired = partial.trimEnd();
  // Strip incomplete last token: trailing comma, or an unclosed string/object
  repaired = repaired.replace(/,\s*$/, '');     // trailing comma
  repaired = repaired.replace(/"[^"]*$/, '"…"'); // unclosed string → close with ellipsis
  repaired = repaired.replace(/:\s*$/, ': null');// lone colon

  // Close open structures in reverse order
  for (let i = stack.length - 1; i >= 0; i--) {
    repaired += stack[i] === '{' ? '}' : ']';
  }

  try {
    const parsed = JSON.parse(repaired);
    // Only consider it usable if we got at least 1 item or basic receipt info
    if (parsed && (Array.isArray(parsed.items) || parsed.store_name)) {
      return parsed;
    }
    return null;
  } catch (_) {
    return null;
  }
}

// ─── Gemini call ──────────────────────────────────────────────────────────

export async function extractBillFromImage(base64Image, mimeType = 'image/jpeg') {
  const limitCheck = await checkAiLimit();
  if (!limitCheck.allowed) {
    if (limitCheck.reason === 'daily_limit_reached') {
      throw new Error(tr().quotaDailyFull.replace('{n}', limitCheck.limit));
    } else if (limitCheck.reason === 'monthly_limit_reached') {
      throw new Error(tr().quotaMonthlyFull.replace('{n}', limitCheck.limit));
    } else if (limitCheck.reason === 'unauthenticated') {
      throw new Error(tr().quotaNeedLogin);
    } else {
      throw new Error(limitCheck.reason || tr().quotaCheckFailed);
    }
  }

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
      generation_config: {
        response_mime_type: 'application/json',
        response_schema: {
          type: 'OBJECT',
          properties: {
            is_receipt: { type: 'BOOLEAN' },
            store_name: { type: 'STRING' },
            store_branch: { type: 'STRING', nullable: true },
            store_address: { type: 'STRING', nullable: true },
            store_phone: { type: 'STRING', nullable: true },
            store_type: { type: 'STRING' },
            date: { type: 'STRING', nullable: true },
            time: { type: 'STRING', nullable: true },
            receipt_no: { type: 'STRING', nullable: true },
            cashier: { type: 'STRING', nullable: true },
            currency: { type: 'STRING' },
            items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING' },
                  name_clean: { type: 'STRING' },
                  qty: { type: 'NUMBER' },
                  unit_price: { type: 'NUMBER' },
                  discount: { type: 'NUMBER' },
                  total: { type: 'NUMBER' },
                  category: { type: 'STRING' },
                  is_promo: { type: 'BOOLEAN' }
                }
              }
            },
            discounts_total: { type: 'NUMBER' },
            subtotal: { type: 'NUMBER' },
            tax_rate: { type: 'STRING', nullable: true },
            tax_amount: { type: 'NUMBER' },
            total: { type: 'NUMBER' },
            payment_method: { type: 'STRING', nullable: true },
            payment_last4: { type: 'STRING', nullable: true },
            points_earned: { type: 'NUMBER', nullable: true },
            note: { type: 'STRING', nullable: true }
          },
          required: ['is_receipt', 'store_name', 'items', 'total', 'currency']
        },
        temperature: 0.1,
        // Gemini 2.5 Flash supports up to 65,536 output tokens — enough for any receipt
        max_output_tokens: 65536,
        // Disable thinking mode for structured JSON extraction:
        // thinking tokens share the output budget and can cause MAX_TOKENS on long bills.
        // For OCR/JSON tasks, thinking provides no benefit over direct extraction.
        thinking_config: { thinking_budget: 0 },
      },
      safety_settings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    let msg = err?.error?.message || `Gemini API error ${response.status}`;
    if (response.status === 429 || msg.includes('Resource exhausted') || msg.includes('429')) {
      msg = tr().quotaBusy;
    }
    throw new Error(msg);
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const raw = candidate?.content?.parts?.[0]?.text;
  const finishReason = candidate?.finishReason;

  if (finishReason && finishReason !== 'STOP') {
    console.warn(`Gemini finishReason is not STOP: ${finishReason}`, data);

    if (finishReason === 'SAFETY') {
      throw new Error(tr().aiSafetyBlocked);
    }

    if (finishReason === 'MAX_TOKENS') {
      // ── Try to salvage partial output before giving up ──────────────────
      console.warn('MAX_TOKENS hit — attempting partial JSON recovery...');
      const recovered = repairPartialBillJson(raw);

      if (recovered && recovered.is_receipt !== false && (recovered.items?.length > 0 || recovered.store_name)) {
        // Recalculate total from recovered items since the footer was cut off
        const recoveredItemsTotal = (recovered.items || []).reduce((s, it) => s + (it.total ?? 0), 0);
        const result = {
          ...recovered,
          is_receipt: true,
          currency: recovered.currency || 'THB',
          // If total is missing/wrong (cut off), estimate from items
          total: (recovered.total && recovered.total > 0) ? recovered.total : Math.round(recoveredItemsTotal * 100) / 100,
          subtotal: recovered.subtotal ?? Math.round(recoveredItemsTotal * 100) / 100,
          tax_amount: recovered.tax_amount ?? 0,
          discounts_total: recovered.discounts_total ?? 0,
          // Mark that data may be incomplete so UI can show a warning
          _partial: true,
          note: [
            recovered.note,
            `⚠️ ${tr().billLongWarn.replace('{n}', recovered.items?.length ?? 0)}`,
          ].filter(Boolean).join(' · '),
        };
        console.info(`Partial recovery succeeded: ${result.items?.length} items, total ≈ ${result.total}`);
        await incrementAiUsage();
        return result;
      }

      // Could not recover anything useful
      throw new Error(
        tr().billTooManyItems.replace('{n}', recovered?.items?.length ?? 0)
      );
    }
  }

  if (!raw) throw new Error('Empty response from Gemini');

  try {
    // Robust parsing: find the first '{' and last '}' to extract only the JSON part
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('No JSON object found in Gemini response:', raw);
      throw new Error(tr().billNoJson);
    }

    const cleanJson = raw.substring(jsonStart, jsonEnd + 1);
    const result = JSON.parse(cleanJson);
    
    if (result) {
      await incrementAiUsage();
    }
    return result;
  } catch (err) {
    console.error('Failed to parse Gemini raw response:', raw);
    console.error('Parsing error:', err);
    throw new Error(tr().billParseError.replace('{msg}', err.message));
  }
}

// ─── Scan a file ─────────────────────────────────────────────────────────────

export async function scanBillFile(file) {
  try {
    // 1. Image resolution: For tall receipts, use higher resolution to capture all text clearly
    let compressed = await compressImage(file, 2048, 0.9);
    // Fallback: if canvas compression fails (e.g. on some iOS WebViews), use original file
    if (!compressed || compressed.size === 0) {
      console.warn('compressImage returned empty blob, falling back to original file');
      compressed = file;
    }
    const { base64, mimeType } = await fileToBase64(compressed);
    
    // extractBillFromImage handles the quota check internally
    const bill = await extractBillFromImage(base64, mimeType);
    return bill;
  } catch (error) {
    throw error;
  }
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
      bill.payment_method ? `${tr().billPaidBy.replace('{method}', bill.payment_method)}${bill.payment_last4 ? ` (${bill.payment_last4})` : ''}` : null,
      bill.items?.length ? tr().billItemCount.replace('{n}', bill.items.length) : null,
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
