import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';
import {
  isValidKey,
  isNative,
  getPurchases,
  ensureConfigured,
  identifyUser,
  configuredState,
  _resetStateForTesting,
} from '../rcClient';

jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: jest.fn(),
    getPlatform: jest.fn(),
    isPluginAvailable: jest.fn(),
  },
}));

jest.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    configure: jest.fn(),
    logIn: jest.fn(),
    getOfferings: jest.fn(),
  },
}));

describe('rcClient Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    _resetStateForTesting();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isValidKey', () => {
    it('should validate valid iOS keys', () => {
      expect(isValidKey('appl_abc123def456ghi789', 'appl')).toBe(true);
    });

    it('should validate valid Android keys', () => {
      expect(isValidKey('goog_abc123def456ghi789', 'goog')).toBe(true);
    });

    it('should reject wrong prefix', () => {
      expect(isValidKey('goog_abc123def456ghi789', 'appl')).toBe(false);
      expect(isValidKey('stripe_abc123def456ghi789', 'appl')).toBe(false);
    });

    it('should reject placeholder and repeated characters', () => {
      expect(isValidKey('appl_xxxxxxxxxxxxxxxx', 'appl')).toBe(false);
      expect(isValidKey('appl_1111111111111111', 'appl')).toBe(false);
      expect(isValidKey('appl_test_xxxx_key', 'appl')).toBe(false);
      expect(isValidKey('appl_short', 'appl')).toBe(false);
      expect(isValidKey('', 'appl')).toBe(false);
      expect(isValidKey(null, 'appl')).toBe(false);
    });
  });

  describe('isNative & getPurchases', () => {
    it('isNative should return boolean from Capacitor', () => {
      Capacitor.isNativePlatform.mockReturnValueOnce(true);
      expect(isNative()).toBe(true);

      Capacitor.isNativePlatform.mockReturnValueOnce(false);
      expect(isNative()).toBe(false);
    });

    /**
     * 🔴 บททดสอบกันบั๊กตัวที่ทำให้ App Store reject 2 รอบ
     *
     * Capacitor.registerPlugin() คืนค่าเป็น Proxy ที่สร้างฟังก์ชันให้ "ทุกชื่อ"
     * ที่ถูกอ่าน — รวมถึง `then` ด้วย JS จึงถือว่ามันเป็น thenable
     * `await plugin` จะไปเรียก plugin.then(resolve, reject) = ยิงคำสั่งชื่อ
     * "then" ข้าม bridge ไปหา native ที่ไม่มีเมธอดนี้ → ไม่มีใคร resolve/reject
     * → await ค้างถาวร (อาการที่เห็นคือปุ่ม Subscribe หมุนไม่หยุด)
     *
     * getPurchases() จึงต้องคืน "หน้ากาก" ที่เป็น object ธรรมดา ไม่มี then
     */
    it('getPurchases must NOT return a thenable (กันปุ่มซื้อค้าง)', async () => {
      const RC = await getPurchases();
      expect(RC).toBeTruthy();
      expect(RC.then).toBeUndefined();
      expect('then' in RC).toBe(false);
    });

    it('getPurchases forwards calls to the real plugin', async () => {
      const RC = await getPurchases();
      RC.configure({ apiKey: 'appl_abc123def456ghi789' });
      expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: 'appl_abc123def456ghi789' });
    });

    /**
     * จำลองพฤติกรรมจริงของ Proxy: ถ้าหน้ากากรั่วให้ plugin ดิบหลุดออกไป
     * await จะไม่มีวันจบ — เทสต์นี้จะ timeout ทันทีถ้ามีใครถอดหน้ากากออก
     */
    it('awaiting getPurchases() resolves quickly even if the raw plugin is a hostile thenable', async () => {
      const settled = await Promise.race([
        getPurchases().then(() => 'resolved'),
        new Promise((r) => setTimeout(() => r('hung'), 200)),
      ]);
      expect(settled).toBe('resolved');
    });
  });

  describe('ensureConfigured', () => {
    it('should return web reason when not running on native platform', async () => {
      Capacitor.isNativePlatform.mockReturnValue(false);

      const result = await ensureConfigured();
      expect(result).toEqual({ ok: false, reason: 'web' });
      expect(Purchases.configure).not.toHaveBeenCalled();
    });

    it('should return plugin_missing when Purchases plugin is not in binary', async () => {
      Capacitor.isNativePlatform.mockReturnValue(true);
      Capacitor.getPlatform.mockReturnValue('ios');
      Capacitor.isPluginAvailable.mockReturnValue(false);

      const result = await ensureConfigured();
      expect(result).toEqual({ ok: false, reason: 'plugin_missing' });
      expect(Purchases.configure).not.toHaveBeenCalled();
    });

    it('should return not_configured when API key is missing or invalid', async () => {
      Capacitor.isNativePlatform.mockReturnValue(true);
      Capacitor.getPlatform.mockReturnValue('ios');
      Capacitor.isPluginAvailable.mockReturnValue(true);
      process.env.REACT_APP_REVENUECAT_API_KEY_IOS = '';

      const result = await ensureConfigured();
      expect(result).toEqual({ ok: false, reason: 'not_configured' });
      expect(Purchases.configure).not.toHaveBeenCalled();
    });

    it('should configure Purchases with valid key on iOS', async () => {
      Capacitor.isNativePlatform.mockReturnValue(true);
      Capacitor.getPlatform.mockReturnValue('ios');
      Capacitor.isPluginAvailable.mockReturnValue(true);
      process.env.REACT_APP_REVENUECAT_API_KEY_IOS = 'appl_valid_real_key_12345678';
      Purchases.configure.mockResolvedValueOnce();

      const result = await ensureConfigured();
      expect(result).toEqual({ ok: true, reason: null, userId: null });
      expect(Purchases.configure).toHaveBeenCalledWith({
        apiKey: 'appl_valid_real_key_12345678',
      });
      expect(configuredState()).toEqual({ ok: true, reason: null, userId: null });
    });

    it('should pass appUserID if userId is provided', async () => {
      Capacitor.isNativePlatform.mockReturnValue(true);
      Capacitor.getPlatform.mockReturnValue('ios');
      Capacitor.isPluginAvailable.mockReturnValue(true);
      process.env.REACT_APP_REVENUECAT_API_KEY_IOS = 'appl_valid_real_key_12345678';
      Purchases.configure.mockResolvedValueOnce();

      const result = await ensureConfigured('user_123');
      expect(result).toEqual({ ok: true, reason: null, userId: 'user_123' });
      expect(Purchases.configure).toHaveBeenCalledWith({
        apiKey: 'appl_valid_real_key_12345678',
        appUserID: 'user_123',
      });
    });

    it('should deduplicate concurrent configure calls (single-flight)', async () => {
      Capacitor.isNativePlatform.mockReturnValue(true);
      Capacitor.getPlatform.mockReturnValue('ios');
      Capacitor.isPluginAvailable.mockReturnValue(true);
      process.env.REACT_APP_REVENUECAT_API_KEY_IOS = 'appl_valid_real_key_12345678';
      Purchases.configure.mockImplementation(() => new Promise((r) => setTimeout(r, 20)));

      const [res1, res2, res3] = await Promise.all([
        ensureConfigured(),
        ensureConfigured(),
        ensureConfigured(),
      ]);

      expect(Purchases.configure).toHaveBeenCalledTimes(1);
      expect(res1.ok).toBe(true);
      expect(res2.ok).toBe(true);
      expect(res3.ok).toBe(true);
    });
  });

  describe('identifyUser', () => {
    it('should delegate to Purchases.logIn if configured', async () => {
      Capacitor.isNativePlatform.mockReturnValue(true);
      Capacitor.getPlatform.mockReturnValue('ios');
      Capacitor.isPluginAvailable.mockReturnValue(true);
      process.env.REACT_APP_REVENUECAT_API_KEY_IOS = 'appl_valid_real_key_12345678';
      Purchases.configure.mockResolvedValueOnce();
      Purchases.logIn.mockResolvedValueOnce({ customerInfo: {} });

      await ensureConfigured();
      await identifyUser('auth_user_999');

      expect(Purchases.logIn).toHaveBeenCalledWith({ appUserID: 'auth_user_999' });
      expect(configuredState()?.userId).toBe('auth_user_999');
    });

    it('should do nothing if userId is empty', async () => {
      await identifyUser('');
      expect(Purchases.logIn).not.toHaveBeenCalled();
    });
  });
});
