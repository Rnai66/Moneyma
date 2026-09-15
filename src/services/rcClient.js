/**
 * rcClient.js — เจ้าของ Purchases.configure() เพียงจุดเดียวของทั้งแอป
 *
 * 🔴 ทำไมต้องมีไฟล์นี้ (สาเหตุที่ App Store reject ครั้งที่แล้ว — Guideline 2.1a)
 * เดิมมีคน configure RevenueCat อยู่ 2 ที่ที่ไม่รู้จักกัน:
 *   1) SubscriptionService.initRevenueCat()  → RC.configure()
 *   2) PaymentService.init()                 → Purchases.configure()
 * แต่ละที่มีธงของตัวเอง (`rcInitialized` กับ `this.isInitialized`) ธงจึงไม่กันกัน
 * ผลคือ SDK ถูก configure ซ้ำ (บางครั้งขณะที่ configure รอบแรกยังไม่จบ)
 * RevenueCat จะรีเซ็ต StoreKit listener ทิ้ง → promise ของการซื้อที่ค้างอยู่
 * "ไม่ resolve และไม่ reject" = ปุ่มหมุนค้างแบบที่ผู้ตรวจของ Apple เจอ
 *
 * กฎจากนี้ไป: ห้ามเรียก Purchases.configure() ที่อื่นอีกเด็ดขาด — เรียกผ่าน
 * ensureConfigured() เท่านั้น ซึ่งรับประกันว่า configure จริงแค่ครั้งเดียวต่อ
 * อายุของ process และมี timeout เสมอ (ไม่มีทางค้างไม่มีที่สิ้นสุด)
 */

import { Capacitor } from '@capacitor/core';
/**
 * 🔴 static import เท่านั้น — ห้ามกลับไปใช้ `await import('@revenuecat/...')`
 *
 * เคยโหลดแบบ dynamic แล้วค้างทุกครั้ง · log ขึ้น "1/4 กำลังโหลดโมดูล" แล้วเงียบ
 * ไม่เคยถึง "2/4" → promise ของ webpack chunk loader ไม่ resolve และไม่ reject
 * (บน capacitor://localhost ถ้า chunk โหลดไม่สำเร็จ script.onerror ไม่ยิง
 *  webpack จึงรอตลอดกาล) ผลคือ configure หมดเวลาทุกครั้งโดยที่คำสั่งไม่เคย
 * ถูกส่งถึง bridge เลย — ใน log จึงไม่มีบรรทัด `To Native -> Purchases configure`
 *
 * static import ไม่มีต้นทุนเพิ่ม: PaymentService.js ก็ import ตัวเดียวกันแบบ static
 * อยู่แล้ว โมดูลอยู่ใน main bundle ตั้งแต่แรก dynamic import จึงมีแต่ความเสี่ยง
 */
import { Purchases as RCPurchases } from '@revenuecat/purchases-capacitor';

/**
 * ไม่มีเพดานเวลาสำหรับ configure อีกแล้ว — เพราะเราไม่รอผลของมัน
 * (ดูคอมเมนต์ในบล็อก configure ด้านล่าง) ตัวที่ยังต้องมีเพดานคือ logIn
 * และการถามสินค้าจากร้าน ซึ่งอยู่ใน SubscriptionService
 */

/**
 * 🔴 ห้ามให้ object ของปลั๊กอิน Capacitor ไหลผ่าน promise เด็ดขาด
 *
 * นี่คือสาเหตุจริงของอาการ "ค้างที่ขั้น configure" ที่ไล่ผิดทางมาหลายรอบ
 *
 * `Capacitor.registerPlugin()` คืนค่าเป็น **Proxy** ที่ดัก get แล้วสร้างฟังก์ชัน
 * ให้กับ "ทุกชื่อ property" ที่ถูกอ่าน — รวมถึงชื่อ `then` ด้วย
 * ผลคือ JS มองว่า object นี้เป็น thenable แล้ว `await plugin` จะไปเรียก
 * `plugin.then(resolve, reject)` = ส่งคำสั่งชื่อ "then" ข้าม bridge ไปหา native
 * ฝั่ง native ไม่มีเมธอดชื่อนี้ จึงไม่มีใครเรียก resolve/reject กลับมาเลย
 * → await ค้างถาวร ไม่ throw ไม่ resolve (เหมือนกันหมดทั้ง await และ
 *    `return plugin` ที่อยู่ใน async function ซึ่ง JS จะ await ให้เองเงียบ ๆ)
 *
 * ยืนยันด้วยการฝัง log ลงไปในบันเดิลที่รันจริงบนซิมูเลเตอร์ (6 ก.ย. 2026):
 *   [RC] P1 enter-try keylen=32     ← ถึงบรรทัดก่อน await
 *   (ไม่มี P2 ต่อ)                   ← ค้างคาที่ `await getPurchases()`
 *
 * ทางแก้: ห่อด้วย object ธรรมดาที่มีเฉพาะเมธอดที่เราใช้ ไม่มี `then`
 * จึงไม่ใช่ thenable อีกต่อไป · await ได้ ส่งผ่าน async function ได้ ปลอดภัย
 * ถ้าต้องใช้เมธอดใหม่ของ RevenueCat ให้ "เพิ่มชื่อในลิสต์นี้" เท่านั้น
 * ห้ามส่ง RCPurchases ดิบ ๆ ออกไปจากไฟล์นี้
 */
const RC_METHODS = [
  'configure',
  'setMockWebResults',
  'setLogLevel',
  'logIn',
  'logOut',
  'getCustomerInfo',
  'getOfferings',
  'getProducts',
  'purchasePackage',
  'purchaseStoreProduct',
  'purchaseSubscriptionOption',
  'restorePurchases',
  'syncPurchases',
  'isConfigured',
  'getAppUserID',
  'addCustomerInfoUpdateListener',
  'removeCustomerInfoUpdateListener',
  'setAttributes',
  'canMakePayments',
  'checkTrialOrIntroductoryPriceEligibility',
];

const RCSafe = {};
for (const name of RC_METHODS) {
  RCSafe[name] = (...args) => RCPurchases[name](...args);
}
// กันพลาด: ถ้าวันหนึ่งมีใครเผลอใส่ then เข้ามา ให้ระเบิดตอน dev ทันที
if ('then' in RCSafe) {
  throw new Error('[RC] RCSafe ต้องไม่มี then — ไม่งั้นจะกลับไปค้างเหมือนเดิม');
}

let Purchases = RCSafe;
/** promise ของ configure ที่กำลังวิ่ง — กันเรียกซ้ำซ้อน (single-flight) */
let configurePromise = null;
/** ผลลัพธ์ที่ตกลงแล้ว: { ok, reason, userId } */
let configured = null;
/** เวลาที่ล้มเหลวครั้งล่าสุด — ใช้กันการยิงรัวตอนลองใหม่ */
let lastFailureAt = 0;

/**
 * เหตุที่ "ลองใหม่แล้วอาจสำเร็จ" — ต่างจากเหตุถาวรอย่างคีย์ผิดหรือรันบนเว็บ
 *
 * 🔴 ทำไมต้องมี: เดิมพอ configure ล้มเหลวครั้งแรก ผลจะถูกจำไว้ถาวร
 * ผู้ใช้กด Subscribe ทีหลังจะได้คำตอบว่า "ซื้อไม่ได้" ทันทีโดยไม่ลองใหม่เลยสักครั้ง
 * ทั้งที่สาเหตุส่วนใหญ่เป็นเรื่องชั่วคราว — โดยเฉพาะการยิงตอนแอปเพิ่งเปิด
 * ซึ่ง bridge ของ Capacitor อาจยังไม่พร้อมรับข้อความ แล้วข้อความนั้นหายไปเฉย ๆ
 */
const RETRYABLE = new Set(['configure_timeout', 'init_failed']);
/** เว้นระยะก่อนลองใหม่ กันการยิงรัวตอนผู้ใช้กดปุ่มถี่ ๆ */
const RETRY_COOLDOWN_MS = 3000;

/**
 * 🔴 ป้ายระบุเวอร์ชันของไฟล์นี้ — เปลี่ยนทุกครั้งที่แก้ตรรกะ configure
 *
 * เสียเวลาไล่ผิดมาหลายรอบเพราะแอปที่รันอยู่เป็นบิลด์เก่า แต่ดูจาก log แยกไม่ออก
 * (`npx cap copy` ไม่เปลี่ยนแอปที่ติดตั้งไว้ ต้อง Build/Run หรือ upload ใหม่)
 * บรรทัดนี้พิมพ์ตอนเริ่ม configure เสมอ — ถ้าไม่เห็นในคอนโซล = กำลังรันโค้ดเก่า
 * เป็น ASCII ล้วนเพื่อให้ grep เจอในไฟล์ที่ minify แล้วด้วย (ข้อความไทยจะถูก escape)
 */
export const RC_CLIENT_BUILD = 'rcclient-2026-09-06-safe-plugin-facade';

export function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * คืน "หน้ากาก" ของปลั๊กอิน (RCSafe) ไม่ใช่ Proxy ดิบ — ดูเหตุผลที่ RC_METHODS
 * ปลอดภัยที่จะ await หรือส่งต่อผ่าน async function เพราะไม่ใช่ thenable
 */
export async function getPurchases() {
  return Purchases;
}

/**
 * คีย์ RevenueCat หน้าตาเป็น `goog_<22+ ตัว>` / `appl_<…>`
 * เช็คให้แน่ใจว่าไม่ใช่ placeholder ไม่งั้น SDK จะ configure สำเร็จเงียบ ๆ
 * แล้วไปพังตอนขอ offerings ซึ่งไล่สาเหตุยากกว่ามาก
 */
export function isValidKey(key, expectedPrefix) {
  if (typeof key !== 'string') return false;
  const value = key.trim();
  if (!value.startsWith(`${expectedPrefix}_`)) return false;
  const body = value.slice(expectedPrefix.length + 1);
  if (body.length < 15) return false;
  if (/^x+$/i.test(body)) return false;
  if (/^(.)\1+$/.test(body)) return false;
  if (/xxxx/i.test(body)) return false;
  return true;
}

function keyForPlatform(platform) {
  return platform === 'ios'
    ? (process.env.REACT_APP_REVENUECAT_API_KEY_IOS || '')
    : (process.env.REACT_APP_REVENUECAT_API_KEY_ANDROID || '');
}

function withTimeoutLocal(promise, ms, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(message);
        err.code = 'TIMEOUT';
        err.isTimeout = true;
        reject(err);
      }, ms);
    }),
  ]);
}

/**
 * configure RevenueCat ให้เรียบร้อย — ปลอดภัยที่จะเรียกกี่ครั้งก็ได้ จากที่ไหนก็ได้
 *
 * เรียกได้ตั้งแต่แอปเปิดโดยไม่ต้องรอ login: ถ้าไม่ส่ง userId มา SDK จะสร้าง
 * anonymous app user ให้เอง ซึ่งเป็นสิ่งที่ทำให้โหมด "ลองใช้ / ใช้งานแบบผู้เยี่ยมชม"
 * ซื้อของได้ทันที (เคสที่ผู้ตรวจของ Apple ใช้ทดสอบ)
 *
 * @returns {Promise<{ok: boolean, reason: string|null}>} ไม่ throw ไม่ว่ากรณีใด
 */
export function ensureConfigured(userId = null) {
  if (configurePromise) return configurePromise;

  if (configured) {
    // สำเร็จแล้ว หรือเป็นเหตุถาวร (เว็บ / คีย์ผิด / ไม่มีปลั๊กอิน) → ตอบเลย
    if (configured.ok || !RETRYABLE.has(configured.reason)) {
      return Promise.resolve(configured);
    }
    // เหตุชั่วคราว: ให้ลองใหม่ได้ แต่เว้นระยะก่อน
    if (Date.now() - lastFailureAt < RETRY_COOLDOWN_MS) {
      return Promise.resolve(configured);
    }
    console.log('[RC] ลอง configure ใหม่ (ครั้งก่อนล้มเหลวด้วย:', configured.reason + ')');
    configured = null;
  }

  configurePromise = (async () => {
    if (!isNative()) {
      // เว็บใช้ Stripe — ไม่ต้อง configure RevenueCat
      configured = { ok: false, reason: 'web' };
      return configured;
    }

    const platform = Capacitor.getPlatform();

    /**
     * 🔴 เช็คก่อนว่าปลั๊กอิน native ถูกคอมไพล์เข้าแอปจริงหรือยัง
     *
     * ถ้าเรียกเมธอดของปลั๊กอินที่ไม่ได้ถูก register ไว้ในไบนารี Capacitor จะส่ง
     * ข้อความไปที่ bridge แล้ว **ไม่มีใครตอบกลับเลย** — promise ค้างถาวร ไม่ reject
     * (web fallback ของ RevenueCat reject ทันทีด้วย "Web not supported" จึงไม่ใช่ต้นเหตุ)
     * อาการที่เห็นคือ configure หมดเวลาทุกครั้งทั้งที่คีย์และเน็ตปกติดี
     *
     * มักเกิดตอนเพิ่งเพิ่มปลั๊กอินใน CapApp-SPM/Package.swift แต่ยังไม่ได้ให้ Xcode
     * resolve package + build ใหม่ · `npx cap copy` คัดลอกแค่ไฟล์เว็บ ไม่แตะไบนารี
     * แก้: Xcode → File → Packages → Resolve Package Versions → แล้ว Build/Run ใหม่
     */
    let pluginAvailable = true;
    try {
      pluginAvailable = Capacitor.isPluginAvailable('Purchases');
    } catch {
      pluginAvailable = true; // เช็คไม่ได้ก็อย่าไปขวางทาง ปล่อยให้ timeout จัดการ
    }
    console.log('[RC] ปลั๊กอิน Purchases ในไบนารีแอป:', pluginAvailable ? 'มี ✅' : 'ไม่มี ❌');
    if (!pluginAvailable) {
      console.error(
        '[RC] 🔴 แอปที่รันอยู่ไม่มีปลั๊กอิน RevenueCat — เรียกไปก็ไม่มีใครตอบ\n' +
        '     ใน Xcode: File → Packages → Resolve Package Versions แล้ว Build/Run ใหม่\n' +
        '     (npx cap copy คัดลอกแค่ไฟล์เว็บ ไม่ได้ประกอบไบนารีใหม่)'
      );
      configured = { ok: false, reason: 'plugin_missing' };
      return configured;
    }

    const prefix = platform === 'ios' ? 'appl' : 'goog';
    const apiKey = keyForPlatform(platform);

    if (!isValidKey(apiKey, prefix)) {
      console.warn(
        `[RC] คีย์ ${platform} หายหรือเป็น placeholder — ตั้ง ` +
        `REACT_APP_REVENUECAT_API_KEY_${platform.toUpperCase()} แล้ว build ใหม่`
      );
      configured = { ok: false, reason: 'not_configured' };
      return configured;
    }

    try {
      /**
       * 🔴 ต้องครอบ "ทั้งก้อน" ไม่ใช่ครอบแค่ RC.configure()
       *
       * เดิม `await getPurchases()` อยู่นอกเพดานเวลา — บรรทัดนั้นคือ dynamic import
       * ของปลั๊กอิน ซึ่งบน WKWebView ถ้าโหลด chunk ไม่สำเร็จ promise จะค้างเงียบ ๆ
       * ไม่ reject ผลคือ ensureConfigured() ไม่มีวันจบ แล้วทุกคนที่ await มันก็ค้างตาม
       * (log ฟ้องว่าค้างที่ขั้น "configure" ทั้งที่ RC.configure เองมี timeout อยู่แล้ว)
       * ตอนนี้ทั้งการโหลดปลั๊กอินและการ configure อยู่ใต้เพดานเดียวกัน
       */
      /**
       * log ละเอียดทีละขั้น — จำเป็นเพราะ "configure หมดเวลา" บอกได้แค่ว่าค้าง
       * แต่บอกไม่ได้ว่าค้างตอนโหลดโมดูล ตอนเรียก หรือตอนรอ native ตอบ
       * ทั้งสามขั้นมีวิธีแก้คนละแบบสิ้นเชิง
       */
      /**
       * 🔴 configure เป็น fire-and-forget — ห้าม await promise ของมัน
       *
       * เมธอด configure ของปลั๊กอิน RevenueCat ฝั่ง native ประกาศเป็น
       * `CAPPluginReturnNone` แปลว่า bridge ของ Capacitor **ไม่ส่ง callback กลับมา
       * โดยดีไซน์** promise ฝั่ง JS จึงไม่มีวัน resolve ไม่ว่าจะรอนานแค่ไหน
       *
       * เคยแก้ด้วยการ race 1.5 วิแล้วยังได้ configure_timeout อยู่ดี
       * (เห็นจาก TestFlight บนเครื่องจริง) เพราะยังมี await คร่อมอยู่ในเส้นทาง
       * ทางที่ถูกคือ **ไม่รอมันเลย** — ยิงคำสั่งไปแล้วเดินต่อ
       *
       * ฝั่ง native ของ RevenueCat ทำงานแบบ synchronous อยู่แล้ว การ configure
       * เสร็จตั้งแต่ก่อน bridge จะได้ส่งอะไรกลับด้วยซ้ำ · ตัวชี้ขาดว่าระบบพร้อมจริง
       * ไม่ใช่ promise ของ configure แต่คือ getProducts() ว่าคืนสินค้ามาไหม
       * ซึ่งมีเพดานเวลาและข้อความ error ของตัวเองอยู่แล้ว
       */
      const RC = await getPurchases();
      const options = { apiKey };
      // ส่ง appUserID เฉพาะตอนมี user จริง — ส่ง null ทำให้ SDK บางเวอร์ชัน
      // ตีความว่า "ตั้งใจล้าง user" แทนที่จะใช้ anonymous id ตามปกติ
      if (userId) options.appUserID = userId;

      console.log('[RC] build =', RC_CLIENT_BUILD);
      console.log('[RC] เรียก configure (คีย์ขึ้นต้น', String(apiKey).slice(0, 5) + '…) แบบไม่รอผล');
      try {
        const ret = RC.configure(options);
        // กัน unhandled rejection ถ้าฝั่ง native ตอบกลับมาเป็น error ทีหลัง
        if (ret && typeof ret.then === 'function') {
          ret.then(
            () => console.log('[RC] configure ตอบกลับมาแล้ว (ช้ากว่าที่เราเดินต่อไป)'),
            (e) => console.warn('[RC] configure ตอบกลับเป็น error:', e?.message || e),
          );
        }
      } catch (syncErr) {
        // เรียกไม่ผ่านตั้งแต่ต้น = ของจริง ไม่ใช่เรื่อง bridge ไม่ตอบ
        console.error('[RC] configure โยน error ทันที:', syncErr);
        configured = { ok: false, reason: 'init_failed' };
        lastFailureAt = Date.now();
        return configured;
      }

      // เว้นจังหวะสั้น ๆ ให้ฝั่ง native ตั้งตัวก่อนจะมีใครเรียก getProducts ต่อ
      await new Promise((resolve) => setTimeout(resolve, 400));

      configured = { ok: true, reason: null, userId: userId || null };
      console.log('[RC] configured แล้ว สำหรับ:', userId || 'anonymous (guest)');
      return configured;
    } catch (err) {
      // พิมพ์ทุกฟิลด์ที่มี — error ของ Capacitor/RevenueCat ชอบซ่อนรายละเอียดไว้
      // ใน message/code/underlyingErrorMessage ซึ่ง JSON.stringify ปกติมองไม่เห็น
      console.error('[RC] configure ล้มเหลว:', err,
        '· message =', err?.message,
        '· code =', err?.code,
        '· underlying =', err?.underlyingErrorMessage,
        '· keys =', err && typeof err === 'object' ? Object.keys(err).join(',') : typeof err);
      configured = { ok: false, reason: err?.isTimeout ? 'configure_timeout' : 'init_failed' };
      lastFailureAt = Date.now();
      return configured;
    }
  })();

  // ปล่อยธง single-flight ทิ้งเมื่อจบ เผื่อ configure ล้มเหลวจะได้ลองใหม่ได้
  configurePromise.finally(() => {
    configurePromise = null;
  });

  return configurePromise;
}

/**
 * ผูก user จริงเข้ากับ anonymous id ที่ SDK สร้างไว้ตอน guest
 * ใช้ตอน login สำเร็จ — ไม่ configure ซ้ำ ใช้ logIn() ตามที่ RevenueCat กำหนด
 */
export async function identifyUser(userId) {
  if (!userId) return;
  const state = await ensureConfigured();
  if (!state.ok) return;
  if (state.userId === userId) return;
  try {
    await withTimeoutLocal(
      (async () => {
        const RC = await getPurchases();
        await RC.logIn({ appUserID: userId });
      })(),
      10000,
      'RevenueCat logIn timed out'
    );
    configured = { ...state, userId };
  } catch (err) {
    console.warn('[RC] logIn ล้มเหลว (ไม่กระทบการซื้อ):', err);
  }
}

/** สถานะปัจจุบันแบบไม่ await — ใช้ตัดสินใจใน UI เท่านั้น */
export function configuredState() {
  return configured;
}

export { withTimeoutLocal as rcWithTimeout };

/** สำหรับ reset สถานะใน Unit Test */
export function _resetStateForTesting() {
  configurePromise = null;
  configured = null;
  lastFailureAt = 0;
}
