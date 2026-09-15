/**
 * BluetoothPrinter — ต่อกับเครื่องพิมพ์สลิปผ่านบลูทูธ
 *
 * ══════════════════════════════════════════════════════════════
 * 🔴 รองรับเฉพาะเครื่องพิมพ์ BLE เท่านั้น ไม่ใช่ Bluetooth Classic (SPP)
 *
 *    เครื่องพิมพ์สลิปราคาหลักพันในไทยส่วนใหญ่เป็น SPP ซึ่ง:
 *      - iPhone คุยด้วยไม่ได้เลย Apple อนุญาตเฉพาะอุปกรณ์ MFi
 *      - Web Bluetooth ก็คุยไม่ได้ เพราะมาตรฐานรองรับแค่ GATT (BLE)
 *    ก่อนซื้อเครื่องต้องดูสเปกให้เจอคำว่า BLE / Bluetooth 4.0 ขึ้นไป
 *    ถ้าสเปกเขียนแค่ "Bluetooth 2.0/3.0 SPP" คือใช้กับแอปนี้ไม่ได้
 *
 * 🔴 Web Bluetooth ใช้ได้เฉพาะ Chrome/Edge บนเดสก์ท็อปและ Android
 *    Safari ไม่รองรับ และ WKWebView ของ Capacitor ก็ไม่รองรับ
 *    บนแอปจริงต้องต่อผ่านปลั๊กอิน BLE (ดู connectNative ด้านล่าง)
 * ══════════════════════════════════════════════════════════════
 */

import { Capacitor } from '@capacitor/core';

const DEVICE_NAME_KEY = 'moneyma_bt_printer_name';

/**
 * service/characteristic ที่เครื่องพิมพ์ BLE ในตลาดใช้กัน
 * เรียงจากที่เจอบ่อยที่สุด — ตอนต่อจะไล่หาตัวแรกที่เขียนได้
 */
const PRINTER_SERVICES = [
  0x18f0,                                   // เจอบ่อยที่สุดในเครื่องจีน
  0xff00,
  0xffe0,                                   // โมดูล HM-10
  0xff80,
  0xfee7,
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',   // Microchip/ISSC transparent UART
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '000018f0-0000-1000-8000-00805f9b34fb',
];

let device = null;
let characteristic = null;

function remember(name) {
  try { localStorage.setItem(DEVICE_NAME_KEY, name || ''); } catch (e) { /* ไม่เป็นไร */ }
}

/** ชื่อเครื่องที่เคยต่อไว้ — เอาไปโชว์ในหน้าตั้งค่า */
export function lastDeviceName() {
  try { return localStorage.getItem(DEVICE_NAME_KEY) || ''; } catch (e) { return ''; }
}

export function isConnected() {
  return Boolean(characteristic && device?.gatt?.connected);
}

export function connectedName() {
  return device?.name || '';
}

/** เบราว์เซอร์/แพลตฟอร์มนี้ต่อบลูทูธได้ไหม */
export function support() {
  if (Capacitor.isNativePlatform()) {
    return {
      ok: false,
      reason: 'native_plugin_missing',
      message: 'บนแอปต้องติดตั้งปลั๊กอิน BLE ก่อน (ดูหมายเหตุใน BluetoothPrinter.js)',
    };
  }
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    return {
      ok: false,
      reason: 'unsupported_browser',
      message: 'เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth — ใช้ Chrome หรือ Edge',
    };
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return {
      ok: false,
      reason: 'insecure',
      message: 'ต้องเปิดผ่าน https:// เท่านั้น',
    };
  }
  return { ok: true };
}

/** หา characteristic ที่เขียนข้อมูลได้จากเครื่องที่ต่ออยู่ */
async function findWritable(server) {
  let services = [];
  try {
    services = await server.getPrimaryServices();
  } catch (e) {
    services = [];
  }

  for (const service of services) {
    let chars = [];
    try {
      chars = await service.getCharacteristics();
    } catch (e) {
      continue;
    }
    for (const c of chars) {
      if (c.properties.write || c.properties.writeWithoutResponse) return c;
    }
  }
  return null;
}

/**
 * ต่อเครื่องพิมพ์ — ต้องเรียกจากการกดปุ่มของผู้ใช้เท่านั้น
 * (Web Bluetooth บังคับว่าต้องมี user gesture ไม่งั้น requestDevice จะถูกปฏิเสธ)
 */
export async function connect() {
  const s = support();
  if (!s.ok) throw new Error(s.message);

  // acceptAllDevices แทนการกรองด้วย service เพราะเครื่องพิมพ์หลายรุ่น
  // ไม่ประกาศ service ตอน advertise ถ้ากรองจะไม่ขึ้นในรายการให้เลือกเลย
  device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });

  device.addEventListener('gattserverdisconnected', () => {
    characteristic = null;
  });

  const server = await device.gatt.connect();
  characteristic = await findWritable(server);

  if (!characteristic) {
    try { device.gatt.disconnect(); } catch (e) { /* ไม่เป็นไร */ }
    device = null;
    throw new Error(
      'ต่อติดแล้วแต่ไม่พบช่องสำหรับส่งข้อมูล — เครื่องนี้อาจเป็นแบบ SPP ซึ่งใช้กับเว็บไม่ได้'
    );
  }

  remember(device.name);
  return { name: device.name || 'เครื่องพิมพ์', id: device.id };
}

export function disconnect() {
  try { device?.gatt?.disconnect(); } catch (e) { /* ไม่เป็นไร */ }
  device = null;
  characteristic = null;
}

/**
 * ส่งข้อมูลไปเครื่องพิมพ์
 *
 * 🔴 ต้องหั่นเป็นก้อนเล็กและหน่วงเวลาระหว่างก้อน
 *    BLE ส่งได้ครั้งละไม่กี่สิบไบต์ และบัฟเฟอร์ของเครื่องพิมพ์ถูก ๆ เล็กมาก
 *    ถ้ายิงรวดเดียวจะได้กระดาษที่พิมพ์ครึ่งใบแล้วหยุด หรือขยะเต็มม้วน
 *
 * @param {Uint8Array} bytes
 * @param {object} opts { chunkSize, delayMs, onProgress(sent, total) }
 */
export async function write(bytes, opts = {}) {
  if (!isConnected()) throw new Error('ยังไม่ได้ต่อเครื่องพิมพ์');

  const chunkSize = opts.chunkSize ?? 180;
  const delayMs = opts.delayMs ?? 18;
  const canFast = characteristic.properties.writeWithoutResponse;

  for (let at = 0; at < bytes.length; at += chunkSize) {
    const chunk = bytes.subarray(at, at + chunkSize);
    if (canFast && characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else if (characteristic.writeValueWithResponse) {
      await characteristic.writeValueWithResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    if (opts.onProgress) opts.onProgress(Math.min(at + chunkSize, bytes.length), bytes.length);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
}

/**
 * ทางสำหรับแอปจริง (iOS/Android) — ยังไม่ได้ต่อ
 *
 * ขั้นตอนเมื่อพร้อมทำ:
 *   1. npm i @capacitor-community/bluetooth-le
 *   2. iOS: เพิ่ม NSBluetoothAlwaysUsageDescription ใน ios/App/App/Info.plist
 *   3. Android: ปลั๊กอินเติม BLUETOOTH_SCAN / BLUETOOTH_CONNECT ให้เอง
 *      แต่ต้องขอสิทธิ์ตอนรันด้วย
 *   4. เปลี่ยน connect()/write() ให้เรียก BleClient แทน navigator.bluetooth
 *      โดยใช้ writeWithoutResponse และหั่นก้อนเท่าเดิม
 *
 * ตัว escpos.js กับ thermalRender.js ใช้ซ้ำได้ทั้งหมด ไม่ต้องแก้
 */
export async function connectNative() {
  throw new Error('ยังไม่ได้ติดตั้งปลั๊กอิน BLE สำหรับแอป — ตอนนี้ใช้ได้เฉพาะบนเว็บ Chrome');
}
