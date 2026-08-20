import { checkAiLimit, incrementAiUsage } from './AiUsageService';

import { tr } from '../i18n/lang';
// Use Gemini 2.5 Flash explicitly for better OCR and higher output capacity
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are a Thai banking slip OCR extractor.
Extract ALL data from payment slip images and respond ONLY with a single raw JSON object.
No markdown, no explanation, no extra text — just the JSON.

Required fields:
{
  "is_slip": boolean,
  "payment_type": "โอนเงิน|จ่ายบิล|เติมเงิน|ชำระหนี้|อื่นๆ or null",
  "status": "สำเร็จ|ล้มเหลว|รอดำเนินการ or null",
  "date": "YYYY-MM-DD or null",
  "time": "HH:mm or null",
  "amount": number or null,
  "currency": "THB",
  "sender_name": "string or null",
  "sender_account": "masked account number string or null",
  "receiver_name": "string or null",
  "receiver_account": "masked account number string or null",
  "bank_name": "sender bank name string or null",
  "receiver_bank": "receiver bank name string or null",
  "ref_id": "primary reference/transaction ID or null",
  "ref_id2": "secondary reference / customer code / Ref.1 or null",
  "address": "address found on slip or null",
  "sub_items": [{"label": "string", "value": "string"}] or [],
  "category": "อาหาร|เดินทาง|ช้อปปิ้ง|บิลค่าไฟน้ำ|โอนให้เพื่อน|อื่นๆ",
  "note": "short description in Thai or null"
}

Field rules:
- payment_type: "จ่ายบิล" if paying utility/bill, "โอนเงิน" if person-to-person transfer, etc.
- status: look for text like "สำเร็จ", "เสร็จสิ้น", "สำเร็จเรียบร้อย" → "สำเร็จ"
- sender_account / receiver_account: include masked numbers like "xxx-xxx019-1"
- ref_id: main transaction reference code
- ref_id2: secondary customer code / Ref.1 / meter number
- address: full address if shown on slip
- sub_items: any itemized charges, e.g. [{"label":"ค่าไฟฟ้า มี.ค. 69","value":"343.68"}, {"label":"ค่าขอผ่อนผันฯ","value":"0.00"}]

Category rules:
- อาหาร: Starbucks, McDonald, ร้านอาหาร, Café, 7-eleven, Lotus
- เดินทาง: Grab, Bolt, Taxi, BTS, MRT, ปั้มน้ำมัน, PTT, Shell
- ช้อปปิ้ง: Central, Lazada, Shopee, Emporium, fashion brands
- บิลค่าไฟน้ำ: MEA, PEA, การไฟฟ้า, การประปา, TRUE, AIS, DTAC, internet
- โอนให้เพื่อน: personal name transfer, peer-to-peer
- อื่นๆ: anything else

If the image is NOT a payment slip, return: {"is_slip": false}`;



/**
 * Extract slip data from a base64 image using Gemini Vision API.
 * @param {string} base64Image - Base64-encoded image (no data URI prefix)
 * @param {string} mimeType - 'image/jpeg' | 'image/png' | 'image/webp'
 * @returns {Promise<object>} Parsed slip data
 */
export async function extractSlipFromImage(base64Image, mimeType = 'image/jpeg') {
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
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Image } },
            { text: 'Extract all slip information from this image.' },
          ],
        },
      ],
      generation_config: {
        response_mime_type: 'application/json',
        temperature: 0.1,
        max_output_tokens: 8192,
        // Disable thinking — not needed for structured slip OCR
        thinking_config: { thinking_budget: 0 },
      },
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
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('Empty response from Gemini');

  try {
    const cleaned = raw.replace(/```json|```/gi, '').trim();
    const result = JSON.parse(cleaned);
    
    // Only count as usage if it's successfully parsed and actually a slip (or at least processed)
    if (result) {
      await incrementAiUsage();
    }
    
    return result;
  } catch (err) {
    console.error('Gemini parse error:', err.message);
    console.error('Raw content:', raw);
    throw new Error('Failed to parse Gemini response as JSON. Please check console for raw output.');
  }
}

/**
 * Convert a File or Blob object to base64 string.
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remove "data:image/jpeg;base64," prefix
      const base64 = reader.result.split(',')[1];
      resolve({ base64, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Compress and resize an image before sending to Gemini.
 * Keeps file size reasonable and API costs low.
 */
export function compressImage(file, maxWidth = 1024, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(resolve, 'image/jpeg', quality);
    };
    img.src = url;
  });
}

/**
 * Scan a product image, barcode, price tag, or receipt tag using Gemini AI 2.5 Flash.
 */
export async function scanProductImageWithAI(file) {
  try {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    if (!apiKey) {
      return {
        sku: `AI-${Date.now().toString().slice(-4)}`,
        name: 'สินค้าสแกน AI (ตัวอย่าง)',
        category: 'ทั่วไป',
        cost: 100,
        price: 180,
        stock: 10
      };
    }

    const compressed = await compressImage(file, 1024, 0.85);
    const { base64, mimeType } = await fileToBase64(compressed);

    const prompt = `You are a product, price tag, barcode, and receipt scanner AI.
Analyze this photo and return ONLY a single JSON object with:
{
  "sku": "barcode or SKU code found",
  "name": "Product Name in Thai or English",
  "category": "Category name",
  "cost": number (estimated cost price),
  "price": number (retail price found),
  "stock": number (quantity or 10)
}
No markdown, no conversation, only the JSON.`;

    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64 } }
          ]
        }]
      })
    });

    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanText);

    return {
      sku: parsed.sku || `AI-${Date.now().toString().slice(-4)}`,
      name: parsed.name || 'สินค้าสแกน AI',
      category: parsed.category || 'ทั่วไป',
      cost: Number(parsed.cost) || 0,
      price: Number(parsed.price) || 0,
      stock: Number(parsed.stock) || 10,
    };
  } catch (err) {
    console.error('Gemini product vision scan error:', err);
    return {
      sku: `AI-${Date.now().toString().slice(-4)}`,
      name: 'สินค้าสแกนจากกล้อง/รูปภาพ',
      category: 'ทั่วไป',
      cost: 80,
      price: 150,
      stock: 10
    };
  }
}

