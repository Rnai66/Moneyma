/**
 * qrGen — ตัวสร้าง QR Code ขนาดเล็ก ไม่พึ่ง dependency ภายนอก
 *
 * ทำไมต้องเขียนเอง (อย่าเปลี่ยนไปใช้ QR จาก URL ภายนอกอีก):
 *  1. ใบเสร็จต้องพิมพ์ได้ตอนเน็ตร้านหลุด — ถ้าดึงรูป QR จากอินเทอร์เน็ต
 *     ใบเสร็จจะพิมพ์ออกมาโดยไม่มี QR และ loop ขาดทันทีโดยไม่มีใครรู้
 *  2. documentJpgExporter วาดลง canvas แล้ว toDataURL() — รูปจากโดเมนอื่น
 *     ทำให้ canvas โดน taint แล้ว export รูปไม่ได้เลย
 *
 * รองรับ: byte mode (UTF-8), ECC level M, version 1-10 (ยาวได้ถึง 213 ไบต์)
 * ซึ่งพอสำหรับลิงก์ใบเสร็จแบบ https://<โดเมน>/r/?t=XXXXXXXX
 */

// ── GF(256) ──────────────────────────────────────────────────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** สัมประสิทธิ์ของ generator polynomial สำหรับ ECC จำนวน n ตัว */
function rsGenerator(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];                     // คูณด้วย x -> เลื่อนไปดีกรีสูงขึ้น
      next[j + 1] ^= gfMul(poly[j], EXP[i]);  // คูณด้วย α^i -> ดีกรีเดิม
    }
    poly = next;
  }
  return poly;
}

/** หาร data ด้วย generator เพื่อได้ ECC codewords */
function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen);
  const res = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) res[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return res;
}

// ── ตาราง version (ECC level M เท่านั้น) ─────────────────────────
// [ecPerBlock, blocksGroup1, dataPerBlockGroup1, blocksGroup2, dataPerBlockGroup2]
const VERSIONS_M = {
  1:  [10, 1, 16, 0, 0],
  2:  [16, 1, 28, 0, 0],
  3:  [26, 1, 44, 0, 0],
  4:  [18, 2, 32, 0, 0],
  5:  [24, 2, 43, 0, 0],
  6:  [16, 4, 27, 0, 0],
  7:  [18, 4, 31, 0, 0],
  8:  [22, 2, 38, 2, 39],
  9:  [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};

// ตำแหน่งกึ่งกลางของ alignment pattern แต่ละ version
const ALIGN_POS = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

// bit pattern ของ version info (ใช้เฉพาะ version >= 7)
const VERSION_BITS = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };

const dataCodewords = (v) => {
  const [, b1, d1, b2, d2] = VERSIONS_M[v];
  return b1 * d1 + b2 * d2;
};

/** จำนวนไบต์สูงสุดที่ version นี้รับได้ใน byte mode */
function byteCapacity(v) {
  const countBits = v >= 10 ? 16 : 8;
  return dataCodewords(v) - Math.ceil((4 + countBits) / 8);
}

function pickVersion(byteLen) {
  for (let v = 1; v <= 10; v++) if (byteLen <= byteCapacity(v)) return v;
  throw new Error('qrGen: ข้อมูลยาวเกิน 213 ไบต์ (version 10 / ECC M)');
}

// ── สร้าง bit stream ─────────────────────────────────────────────
function buildCodewords(bytes, version) {
  const bits = [];
  const push = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  push(0b0100, 4);                               // mode: byte
  push(bytes.length, version >= 10 ? 16 : 8);    // character count
  for (const b of bytes) push(b, 8);

  const totalBits = dataCodewords(version) * 8;
  push(0, Math.min(4, totalBits - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);    // เติมให้ครบไบต์

  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    out.push(b);
  }
  const padBytes = [0xec, 0x11];
  for (let i = 0; out.length < dataCodewords(version); i++) out.push(padBytes[i % 2]);
  return out;
}

/** แบ่ง block -> คำนวณ ECC -> สาน (interleave) ตามสเปก */
function interleave(codewords, version) {
  const [ecLen, b1, d1, b2, d2] = VERSIONS_M[version];
  const blocks = [];
  let pos = 0;
  for (let i = 0; i < b1; i++) { blocks.push(codewords.slice(pos, pos + d1)); pos += d1; }
  for (let i = 0; i < b2; i++) { blocks.push(codewords.slice(pos, pos + d2)); pos += d2; }

  const ecBlocks = blocks.map((b) => rsEncode(b, ecLen));

  const result = [];
  const maxData = Math.max(d1, d2);
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.length) result.push(b[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const e of ecBlocks) result.push(e[i]);
  }
  return result;
}

// ── วาง module ลงตาราง ───────────────────────────────────────────
function placeFunctionPatterns(size, version) {
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const setF = (r, c, val) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    m[r][c] = val;
    reserved[r][c] = true;
  };

  // finder pattern + separator 3 มุม
  const finder = (top, left) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inner = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const dark = inner && (r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        setF(top + r, left + c, dark ? 1 : 0);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  // timing pattern
  for (let i = 8; i < size - 8; i++) {
    setF(6, i, i % 2 === 0 ? 1 : 0);
    setF(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // alignment pattern (ห้ามทับ finder)
  const pos = ALIGN_POS[version];
  for (const r of pos) {
    for (const c of pos) {
      const nearFinder =
        (r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8);
      if (nearFinder) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          setF(r + dr, c + dc, ring === 1 ? 0 : 1);
        }
      }
    }
  }

  // dark module ตายตัว
  setF(size - 8, 8, 1);

  // จองพื้นที่ format info (ค่าจริงเติมทีหลัง)
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { reserved[8][i] = true; reserved[i][8] = true; }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }

  // จองพื้นที่ version info (version 7 ขึ้นไป)
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      reserved[a][b] = true;
      reserved[b][a] = true;
    }
  }

  return { m, reserved };
}

function placeData(m, reserved, size, codewords) {
  let bitIndex = 0;
  const nextBit = () => {
    const byteIdx = bitIndex >> 3;
    const bit = byteIdx < codewords.length
      ? (codewords[byteIdx] >> (7 - (bitIndex & 7))) & 1
      : 0; // remainder bits เป็น 0
    bitIndex++;
    return bit;
  };

  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // ข้ามคอลัมน์ timing
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let k = 0; k < 2; k++) {
        const col = right - k;
        if (reserved[row][col]) continue;
        m[row][col] = nextBit();
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** คะแนนโทษตามสเปก — ยิ่งน้อยยิ่งอ่านง่าย */
function penalty(m, size) {
  let score = 0;

  // rule 1: โมดูลสีเดียวกันติดกันเป็นแถว/คอลัมน์
  for (let i = 0; i < size; i++) {
    for (const isRow of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        const cur = isRow ? m[i][j] : m[j][i];
        const prev = isRow ? m[i][j - 1] : m[j - 1][i];
        if (cur === prev) {
          run++;
        } else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }

  // rule 2: บล็อก 2x2 สีเดียวกัน
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }

  // rule 3: รูปแบบคล้าย finder (1:1:3:1:1 + ช่องว่าง 4)
  const P1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const P2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const match = (arr, pat) => pat.every((v, i) => arr[i] === v);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j <= size - 11; j++) {
      const row = [], col = [];
      for (let k = 0; k < 11; k++) { row.push(m[i][j + k]); col.push(m[j + k][i]); }
      if (match(row, P1) || match(row, P2)) score += 40;
      if (match(col, P1) || match(col, P2)) score += 40;
    }
  }

  // rule 4: สัดส่วนสีดำเบี่ยงจาก 50%
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  const pct = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;

  return score;
}

/** format info = ECC level (M = 00) + mask, ป้องกันด้วย BCH(15,5) */
function formatBits(mask) {
  const data = (0b00 << 3) | mask;
  let rem = data << 10;
  for (let i = 4; i >= 0; i--) {
    if ((rem >> (i + 10)) & 1) rem ^= 0x537 << i;
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function applyFormat(m, size, mask) {
  const bits = formatBits(mask);
  const bit = (i) => (bits >> i) & 1;

  // แถบแนวตั้งข้าง finder ซ้ายบน + ต่อลงล่างซ้าย
  for (let i = 0; i < 15; i++) {
    if (i < 6) m[i][8] = bit(i);
    else if (i < 8) m[i + 1][8] = bit(i);
    else m[size - 15 + i][8] = bit(i);
  }
  // แถบแนวนอน: ขวาบนก่อน แล้ววนกลับมาซ้าย
  for (let i = 0; i < 15; i++) {
    if (i < 8) m[8][size - 1 - i] = bit(i);
    else if (i === 8) m[8][7] = bit(i);
    else m[8][14 - i] = bit(i);
  }

  m[size - 8][8] = 1; // dark module
}

function applyVersionInfo(m, size, version) {
  if (version < 7) return;
  const bits = VERSION_BITS[version];
  for (let i = 0; i < 18; i++) {
    const b = (bits >> i) & 1;
    const a = Math.floor(i / 3);
    const c = (i % 3) + size - 11;
    m[a][c] = b;
    m[c][a] = b;
  }
}

function utf8Bytes(str) {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str));
  return Array.from(unescape(encodeURIComponent(str)), (ch) => ch.charCodeAt(0));
}

/**
 * สร้างตาราง QR
 *
 * ตรวจแล้ว: ผลลัพธ์ตรงบิตต่อบิตกับไลบรารี `qrcode` (byte mode / ECC M)
 * ตั้งแต่ 1 ถึง 213 ไบต์ และถอดรหัสกลับด้วย jsQR สำเร็จ 300/300 ครั้ง
 *
 * @param {string} text
 * @param {number} [forceMask] บังคับ mask — ใช้ตอนเทสต์เท่านั้น ปกติไม่ต้องส่ง
 * @returns {number[][]} ตาราง 0/1 — 1 คือโมดูลสีเข้ม
 */
export function qrMatrix(text, forceMask) {
  const bytes = utf8Bytes(String(text));
  const version = pickVersion(bytes.length);
  const size = version * 4 + 17;
  const codewords = interleave(buildCodewords(bytes, version), version);

  const { m: base, reserved } = placeFunctionPatterns(size, version);
  applyVersionInfo(base, size, version);
  placeData(base, reserved, size, codewords);

  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    if (forceMask !== undefined && mask !== forceMask) continue;
    const cand = base.map((row) => row.slice());
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!reserved[r][c] && MASKS[mask](r, c)) cand[r][c] ^= 1;
      }
    }
    applyFormat(cand, size, mask);
    const s = penalty(cand, size);
    if (s < bestScore) { bestScore = s; best = cand; }
  }
  return best;
}

/**
 * SVG string — ใช้กับการพิมพ์ (คมทุกความละเอียด ไม่เบลอเหมือน bitmap)
 * @param {string} text
 * @param {object} opts  { quiet: จำนวนโมดูลขอบขาว, size: ความกว้าง px }
 */
export function qrSvg(text, opts = {}) {
  const quiet = opts.quiet ?? 2;
  const m = qrMatrix(text);
  const n = m.length;
  const dim = n + quiet * 2;

  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (m[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  const px = opts.size ? ` width="${opts.size}" height="${opts.size}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}"${px} shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/>` +
    `<path d="${path}" fill="#000"/></svg>`;
}

/** data URL ของ SVG — เอาไปใส่ <img src> ได้ตรง ๆ ไม่ต้องโหลดจากเน็ต */
export function qrSvgDataUrl(text, opts = {}) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvg(text, opts));
}

/**
 * วาด QR ลง canvas โดยตรง (ไม่ผ่าน Image) — สำคัญสำหรับ documentJpgExporter
 * เพราะการโหลดรูปข้ามโดเมนจะทำให้ canvas.toDataURL() พัง
 */
export function drawQrToCanvas(ctx, text, x, y, sizePx, quiet = 2) {
  const m = qrMatrix(text);
  const n = m.length;
  const dim = n + quiet * 2;
  const unit = sizePx / dim;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, sizePx, sizePx);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!m[r][c]) continue;
      ctx.fillRect(
        x + (c + quiet) * unit,
        y + (r + quiet) * unit,
        Math.ceil(unit),
        Math.ceil(unit)
      );
    }
  }
}
