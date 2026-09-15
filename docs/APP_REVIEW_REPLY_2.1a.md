# ตอบกลับ App Review — Guideline 2.1(a)

> **ก่อนส่ง แก้ 2 จุดนี้ก่อน**
> 1. ใส่หมายเลข build ใหม่แทน `Build 20` (build 19 คืออันที่โดน reject)
> 2. ส่งหลังจาก upload build ใหม่ที่มีการแก้โค้ดชุดนี้แล้วเท่านั้น
>    ถ้าส่งจดหมายก่อน ผู้ตรวจจะกดทดสอบ build เดิมแล้วเจอปัญหาเดิมซ้ำ

---

## ข้อความสำหรับวางใน Resolution Center

Dear App Review Team,

Thank you for the detailed report on Version 1.0 (Build 19). We were able to reproduce the
indefinite loading on the Subscribe button and traced it to three defects in our client code,
not only to incomplete App Store Connect metadata. All three are fixed in Build 20.

**Root cause 1 — the purchase SDK was configured twice.**
Two independent modules each configured our in-app purchase SDK on their own initialization
flag. Because neither flag was aware of the other, the SDK could be re-configured while a first
configuration was still in flight, which reset the StoreKit transaction observer. Any purchase
request issued in that window never received a callback — it neither succeeded nor failed, so
the button spun indefinitely. Configuration is now owned by a single module that guarantees
exactly one configuration call per app launch and attaches a hard 12-second ceiling to it.
Signing in now re-identifies the existing user rather than re-configuring the SDK.

**Root cause 2 — a purchase could be requested with a product object that StoreKit never returned.**
When the store returned no products (which is what happened while the subscription group
localization was missing), our paywall constructed a placeholder product object and passed it to
the purchase call. That object is not a real StoreKit product, and the native call did not return.
The paywall now passes only a product identifier; the purchase layer queries StoreKit for the real
product first and reports a clear, localized error if the product is genuinely unavailable.

**Root cause 3 — SDK initialization was sequenced behind a network call.**
Initialization ran after an awaited request to our backend. On a slow or restricted network the
SDK was therefore not ready when a reviewer using "Try Demo / Continue as Guest" tapped Subscribe.
Initialization now runs immediately at launch, before any backend call, and without requiring a
signed-in account — the SDK uses an anonymous app user, so guest mode can purchase right away.

**Loading state can no longer stall.**
Every asynchronous step in the purchase path now has an explicit ceiling, split into two phases so
the ceilings match what each phase actually does:

- Preparing (SDK configuration and StoreKit product lookup): 15 seconds. The button reads
  "Connecting to StoreKit…" during this phase.
- Waiting for the App Store payment sheet: a 120-second ceiling. The button changes to
  "Waiting for App Store…" so the state is never ambiguous. We deliberately did not use a short
  ceiling here, because this phase resolves only after the reviewer completes or cancels Apple's
  sheet, and a short timer would cancel a legitimate purchase in progress.

Loading our subscription status from our backend is also bounded, so the paywall renders even if
our backend is unreachable.

**App Store Connect configuration.**
We added the subscription group localization (MoneyMa Premium) and completed the review
information for all four products: `pro_monthly`, `pro_yearly`, `business_monthly`,
`business_yearly`.

**Steps for the reviewer**

1. Launch the app and tap "Try Demo / Continue as Guest" at the bottom of the welcome screen.
   No account or sign-in is required.
2. On the Dashboard, tap the star icon in the top-right corner to open the MoneyMa Premium page.
3. Tap Subscribe on any plan, for example Pro ฿99/month or Pro ฿1,188/year.
4. The StoreKit sandbox confirmation sheet appears. If it cannot appear for any reason, the button
   returns to its normal state with a clear error message instead of continuing to load.

We verified this flow on an iPad Air 11-inch (M3) running iPadOS 26 in the sandbox environment,
including the guest path and the case where the network is unavailable.

Thank you for your time.

Best regards,
The MoneyMa Team

---

## สิ่งที่แก้ไปในโค้ด (สำหรับอ้างอิงภายใน ไม่ต้องส่งให้ Apple)

| ไฟล์ | ทำอะไร |
|---|---|
| `src/services/rcClient.js` 🆕 | จุดเดียวที่ configure RevenueCat ได้ · single-flight · idempotent · timeout 12 วิ · `identifyUser()` ใช้ `logIn` แทนการ configure ซ้ำ |
| `SubscriptionService.js` | ตัดธง `rcInitialized` ทิ้ง · `isRealStoreProduct()` กรอง product ปลอม · แยกเพดานเวลาเป็น `PREPARE_TIMEOUT_MS` 15 วิ / `STORE_SHEET_TIMEOUT_MS` 120 วิ · `loadSubscription()` มี timeout ทุก call · sync Supabase ไม่บล็อก UI |
| `SubscriptionContext.js` | `initRevenueCat()` ยิงก่อน `await supabase.auth.getUser()` และไม่ผูกกับ user id (guest ซื้อได้) |
| `PaymentService.js` | `init()` เดินผ่าน `rcClient` ไม่ configure เอง · `getOfferings()` init ให้เองแทนคืน null · `getProducts` fallback มี timeout |
| `PremiumSettings.js` | ไม่สร้าง product ปลอม · ปุ่มเปลี่ยนข้อความตาม phase · safety timer คำนวณจากค่ากลาง · กัน `findPackage` คืนแผนผิดด้วย `packageMatchesPlan` |
| `PaywallScreen.js` | safety timer เลิก hardcode 28 วิ |

**ยืนยันแล้ว:** build ผ่านไม่มี warning · เทสต์ 32 เคสผ่านหมด
(`$HOME/rcclient-test.mjs` 10 เคส · `$HOME/purchase-path-test.mjs` 22 เคส)

**ข้อ 3.1.2 ตรวจแล้วผ่านอยู่แล้ว** — หน้า Premium มีข้อความต่ออายุอัตโนมัติ 24 ชม.
พร้อมลิงก์ Terms of Service (EULA) และ Privacy Policy ครบ และ Lifetime ถูกกรองออกบน iOS
เพราะยังไม่ได้สร้าง Non-Consumable IAP ใน App Store Connect
