/**
 * escpos — แปลงใบเสร็จเป็นคำสั่งที่เครื่องพิมพ์สลิปความร้อนเข้าใจ
 *
 * ══════════════════════════════════════════════════════════════
 * 🔴 ทำไมส่งเป็น "ภาพ" ไม่ใช่ "ข้อความ"
 *
 * ESC/POS ส่งข้อความไทยได้ก็จริง แต่ต้องสั่งเปลี่ยน code page เป็น TIS-620
 * (`ESC t 255`) แล้วเครื่องราคาถูกแต่ละยี่ห้อรองรับไม่เหมือนกันเลย
 * บางตัวได้ บางตัวพิมพ์สระลอย บางตัวออกมาเป็น ???? และเราไม่มีทางรู้ล่วงหน้า
 * ว่าร้านซื้อเครื่องรุ่นไหนมา
 *
 * การวาดใบเสร็จลง canvas แล้วส่งเป็น raster (GS v 0) ทำให้กระดาษออกมา
 * "เหมือนที่เห็นบนจอเป๊ะ ๆ" ทุกรุ่น รวมทั้ง QR เก็บใบเสร็จด้วย
 * แลกกับข้อมูลที่ส่งเยอะกว่า ซึ่งยอมได้ เพราะใบเสร็จใบหนึ่งราว 20-40 KB
 * ══════════════════════════════════════════════════════════════
 */

// ── ค่าคงที่ของกระดาษ ────────────────────────────────────────
// จำนวนจุดต่อบรรทัดของหัวพิมพ์มาตรฐาน 203 dpi
export const DOTS = {
  '58': 384,
  '80': 576,
};

/** จำนวนจุดของกระดาษกว้าง n มม. (ค่าเริ่มต้น 80 มม.) */
export function dotWidth(paperWidth) {
  return DOTS[String(paperWidth)] || DOTS['80'];
}

// ── คำสั่งพื้นฐาน ────────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;

export const CMD = {
  init: [ESC, 0x40],                    // ESC @  — รีเซ็ตเครื่อง
  alignLeft: [ESC, 0x61, 0x00],
  alignCenter: [ESC, 0x61, 0x01],
  feed: (n) => [ESC, 0x64, Math.max(0, Math.min(255, n))],  // ESC d n — เลื่อนกระดาษ n บรรทัด
  cut: [GS, 0x56, 0x42, 0x00],          // GS V B 0 — ตัดกระดาษแบบเลื่อนก่อนตัด
  beep: [ESC, 0x42, 0x02, 0x02],
};

/**
 * แปลง canvas เป็น raster ขาวดำตามสเปก GS v 0
 *
 * @param {HTMLCanvasElement} canvas ต้องกว้างเท่ากับจำนวนจุดของกระดาษพอดี
 * @param {object} opts
 *   threshold  ความสว่างที่ถือว่าเป็นสีดำ (0-255, ค่าเริ่มต้น 160)
 *   bandRows   ความสูงสูงสุดต่อหนึ่งคำสั่ง (เครื่องถูก ๆ ค้างถ้าส่งก้อนใหญ่)
 * @returns {Uint8Array}
 */
export function rasterFromCanvas(canvas, opts = {}) {
  const threshold = opts.threshold ?? 160;
  const bandRows = opts.bandRows ?? 128;
  const skipBlank = opts.skipBlank !== false;

  const w = canvas.width;
  const h = canvas.height;
  if (w % 8 !== 0) {
    throw new Error(`escpos: ความกว้าง canvas ต้องหารด้วย 8 ลงตัว (ได้ ${w})`);
  }

  const ctx = canvas.getContext('2d');
  const px = ctx.getImageData(0, 0, w, h).data;
  const bytesPerRow = w / 8;

  // แปลงทั้งภาพเป็นบิตก่อน แล้วค่อยตัดสินใจว่าแถวไหนต้องส่ง
  const rows = new Array(h);
  const blank = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    const row = new Uint8Array(bytesPerRow);
    let any = 0;
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const i = (y * w + bx * 8 + bit) * 4;
        const a = px[i + 3];
        // พื้นโปร่งใสถือเป็นกระดาษเปล่า
        const lum = a === 0
          ? 255
          : 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        // 🔴 ใช้เกณฑ์ตัดตรง ๆ ไม่ dither
        //    dither ทำให้ตัวอักษรไทยเบลอและ QR สแกนไม่ติด
        if (lum < threshold) byte |= 0x80 >> bit;
      }
      row[bx] = byte;
      any |= byte;
    }
    rows[y] = row;
    blank[y] = any ? 0 : 1;
  }

  const out = [];
  const emitBand = (top, count) => {
    for (let at = 0; at < count; at += bandRows) {
      const n = Math.min(bandRows, count - at);
      // GS v 0 m xL xH yL yH
      out.push(GS, 0x76, 0x30, 0x00,
        bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
        n & 0xff, (n >> 8) & 0xff);
      for (let y = 0; y < n; y++) {
        const row = rows[top + at + y];
        for (let bx = 0; bx < bytesPerRow; bx++) out.push(row[bx]);
      }
    }
  };

  // 🔴 แถวที่ขาวล้วนไม่ต้องส่งเป็นข้อมูลภาพ ใช้ ESC J (เลื่อนกระดาษทีละจุด) แทน
  //    ใบเสร็จมีช่องว่างเยอะ ส่วนนี้ลดข้อมูลที่ต้องยิงผ่าน BLE ได้จริง
  //    ซึ่งสำคัญมากเพราะ BLE ช้า ทุก KB ที่ตัดได้คือเวลารอกระดาษที่สั้นลง
  const MIN_SKIP = 8;
  let y = 0;
  while (y < h) {
    if (skipBlank && blank[y]) {
      let n = 0;
      while (y + n < h && blank[y + n]) n++;
      if (n >= MIN_SKIP) {
        let left = n;
        while (left > 0) {
          const step = Math.min(255, left);
          out.push(ESC, 0x4a, step);   // ESC J n — พิมพ์แล้วเลื่อน n จุด
          left -= step;
        }
        y += n;
        continue;
      }
    }
    let n = 0;
    while (y + n < h && !(skipBlank && blank[y + n] && countBlankFrom(blank, y + n, h) >= MIN_SKIP)) n++;
    if (n === 0) n = 1;
    emitBand(y, n);
    y += n;
  }

  return Uint8Array.from(out);
}

function countBlankFrom(blank, at, h) {
  let n = 0;
  while (at + n < h && blank[at + n]) n++;
  return n;
}

/** ต่อชิ้นส่วนคำสั่งหลาย ๆ ก้อนเป็นสายเดียว */
export function concat(...parts) {
  let len = 0;
  const arrs = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let at = 0;
  for (const a of arrs) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}

/**
 * ชุดคำสั่งเต็มสำหรับพิมพ์ใบเสร็จหนึ่งใบ
 * @param {HTMLCanvasElement} canvas ใบเสร็จที่วาดไว้แล้ว
 * @param {object} opts { feed: บรรทัดที่เลื่อนท้ายใบ, cut: ตัดกระดาษไหม }
 */
export function buildReceiptJob(canvas, opts = {}) {
  const feed = opts.feed ?? 4;
  return concat(
    CMD.init,
    CMD.alignLeft,
    rasterFromCanvas(canvas, opts),
    CMD.feed(feed),
    opts.cut ? CMD.cut : []
  );
}

/**
 * ถอด raster กลับเป็นภาพ — ใช้กับ "เครื่องพิมพ์จำลอง" บนหน้าจอ
 *
 * มีไว้เพื่อให้ทดสอบได้โดยไม่ต้องมีเครื่องจริง และเพื่อให้เห็นว่า
 * สิ่งที่ส่งออกไปจริง ๆ หน้าตาเป็นยังไง ไม่ใช่เดาจากพรีวิว HTML
 *
 * @returns {{width:number, height:number, rows:Uint8Array[]}|null}
 */
export function decodeRaster(bytes) {
  let i = 0;
  let width = 0;
  const bands = [];

  while (i < bytes.length) {
    // GS v 0 — ก้อนข้อมูลภาพ
    if (bytes[i] === GS && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30) {
      const bytesPerRow = bytes[i + 4] | (bytes[i + 5] << 8);
      const rows = bytes[i + 6] | (bytes[i + 7] << 8);
      const start = i + 8;
      const size = bytesPerRow * rows;
      width = bytesPerRow * 8;
      bands.push({ kind: 'img', bytesPerRow, rows, data: bytes.subarray(start, start + size) });
      i = start + size;
      continue;
    }
    // ESC J n — เลื่อนกระดาษ n จุด (คือแถวขาวที่เราไม่ได้ส่งข้อมูลไป)
    // ต้องนับด้วย ไม่งั้นภาพจำลองจะออกมาบีบติดกันไม่เหมือนกระดาษจริง
    if (bytes[i] === ESC && bytes[i + 1] === 0x4a) {
      bands.push({ kind: 'gap', rows: bytes[i + 2] });
      i += 3;
      continue;
    }
    i++;
  }

  if (!bands.some((b) => b.kind === 'img')) return null;
  const bytesPerRow = width / 8;
  const height = bands.reduce((n, b) => n + b.rows, 0);
  const empty = new Uint8Array(bytesPerRow);
  const rows = [];
  for (const b of bands) {
    if (b.kind === 'gap') {
      for (let y = 0; y < b.rows; y++) rows.push(empty);
    } else {
      for (let y = 0; y < b.rows; y++) {
        rows.push(b.data.subarray(y * b.bytesPerRow, (y + 1) * b.bytesPerRow));
      }
    }
  }
  return { width, height, rows };
}

/** ถอด raster แล้ววาดลง canvas — หน้าตาตรงกับกระดาษที่จะออกมาจริง */
export function rasterToCanvas(bytes, canvas) {
  const img = decodeRaster(bytes);
  if (!img) return null;

  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(img.width, img.height);

  for (let y = 0; y < img.height; y++) {
    const row = img.rows[y];
    for (let x = 0; x < img.width; x++) {
      const on = (row[x >> 3] >> (7 - (x & 7))) & 1;
      const v = on ? 0 : 255;
      const i = (y * img.width + x) * 4;
      out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return img;
}
